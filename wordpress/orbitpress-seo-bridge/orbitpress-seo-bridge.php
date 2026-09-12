<?php
/**
 * Plugin Name:       OrbitPress SEO Bridge
 * Plugin URI:        https://github.com/armoula40-max/Orbitpress
 * Description:       Lets the OrbitPress server write Yoast SEO and Rank Math metadata (focus keyphrase, SEO title, meta description, canonical, social tags, stored score) through the REST API with an Application Password. No telemetry, no outbound calls.
 * Version:           1.1.0
 * Requires at least: 5.9
 * Requires PHP:      7.4
 * Author:            OrbitPress
 * License:           GPL-2.0-or-later
 * Text Domain:       orbitpress-seo-bridge
 *
 * Endpoint: POST /wp-json/orbitpress/v1/seo
 * Auth:     Basic auth (WordPress Application Password), requires edit_post on the target.
 * Body:     { post_id, focus_keyphrase, seo_title, seo_description, canonical_url,
 *             og_title, og_description, og_image, twitter_title, twitter_description,
 *             twitter_image, score, schema_type, secondary_keyphrases[], robots_index }
 * Unknown fields and fields for plugins that are not installed are safely skipped.
 */

if ( ! defined( 'ABSPATH' ) ) {
	exit;
}

final class OrbitPress_SEO_Bridge {

	const REST_NAMESPACE = 'orbitpress/v1';
	const REST_ROUTE     = '/seo';
	const PLUGINS_ROUTE  = '/plugins';

	public function __construct() {
		add_action( 'rest_api_init', array( $this, 'register_routes' ) );
		// Run late (after Rank Math/Yoast/WordPress have rewritten rel=):
		// editorially verified references are meant to be followed.
		add_filter( 'the_content', array( $this, 'trusted_reference_links' ), 99 );
	}

	/**
	 * Hosts OrbitPress treats as neutral, editorially safe references: the
	 * Wikimedia family, intergovernmental/official-health bodies, and the
	 * global .gov / .edu / .ac.<cc> address space.
	 */
	private function is_trusted_host( $url ) {
		$host = strtolower( (string) wp_parse_url( $url, PHP_URL_HOST ) );
		if ( '' === $host ) {
			return false;
		}
		$allow = array(
			'wikipedia.org', 'wikimedia.org', 'wikidata.org', 'wikibooks.org',
			'wiktionary.org', 'wikiquote.org', 'wikisource.org',
			'who.int', 'fao.org', 'un.org', 'unicef.org', 'unesco.org',
			'worldbank.org', 'oecd.org', 'iso.org',
			'cdc.gov', 'nih.gov', 'usda.gov', 'fda.gov', 'nist.gov', 'medlineplus.gov',
		);
		foreach ( $allow as $domain ) {
			if ( $host === $domain || substr( $host, -( strlen( $domain ) + 1 ) ) === '.' . $domain ) {
				return true;
			}
		}
		return (bool) preg_match( '/\.(gov|edu|mil)(\.[a-z]{2})?$/', $host )
			|| (bool) preg_match( '/\.ac\.[a-z]{2}$/', $host );
	}

	/**
	 * External links verified by the OrbitPress server (Wikipedia OpenSearch
	 * hits and the trusted-host allowlist above) are tagged with the
	 * orbitpress-trusted-ref class and intended to be ordinary followed links.
	 * If another plugin blanket-adds rel="nofollow" to every outbound link,
	 * remove nofollow/sponsored/ugc from those anchors only, keeping noopener.
	 */
	public function trusted_reference_links( $content ) {
		if ( false === stripos( (string) $content, '<a ' ) ) {
			return $content;
		}
		return preg_replace_callback(
			'/<a\b[^>]*>/i',
			function ( $match ) {
				$tag = $match[0];
				$is_tagged = false !== stripos( $tag, 'orbitpress-trusted-ref' );
				$href      = '';
				if ( preg_match( '/\shref\s*=\s*("|\')(.*?)\1/i', $tag, $hm ) ) {
					$href = html_entity_decode( $hm[2], ENT_QUOTES );
				}
				if ( ! $is_tagged && ! $this->is_trusted_host( $href ) ) {
					return $tag;
				}
				$rel = array( 'noopener' );
				if ( preg_match( '/\srel\s*=\s*("|\')(.*?)\1/i', $tag, $rm ) ) {
					$tokens = preg_split( '/\s+/', strtolower( trim( $rm[2] ) ) );
					foreach ( $tokens as $token ) {
						if ( '' === $token ) {
							continue;
						}
						if ( in_array( $token, array( 'nofollow', 'sponsored', 'ugc' ), true ) ) {
							continue;
						}
						if ( ! in_array( $token, $rel, true ) ) {
							$rel[] = $token;
						}
					}
				}
				$rel_attr = implode( ' ', $rel );
				if ( preg_match( '/\srel\s*=\s*("|\')/i', $tag ) ) {
					$tag = preg_replace( '/\srel\s*=\s*("|\').*?\1/i', ' rel="' . esc_attr( $rel_attr ) . '"', $tag, 1 );
				} else {
					$tag = preg_replace( '/<a\b/i', '<a rel="' . esc_attr( $rel_attr ) . '"', $tag, 1 );
				}
				return $tag;
			},
			(string) $content
		);
	}

	/** Which SEO plugins are active on this site. */
	private function detect_plugins() {
		return array(
			'rankmath' => class_exists( 'RankMath' ) || defined( 'RANK_MATH_VERSION' ),
			'yoast'    => defined( 'WPSEO_VERSION' ) || class_exists( 'WPSEO_Options' ),
		);
	}

	public function register_routes() {
		register_rest_route(
			self::REST_NAMESPACE,
			self::PLUGINS_ROUTE,
			array(
				'methods'             => WP_REST_Server::READABLE,
				'callback'            => array( $this, 'plugins_response' ),
				'permission_callback' => '__return_true',
			)
		);

		register_rest_route(
			self::REST_NAMESPACE,
			self::REST_ROUTE,
			array(
				'methods'             => WP_REST_Server::CREATABLE,
				'callback'            => array( $this, 'write_seo_meta' ),
				'permission_callback' => array( $this, 'permission' ),
				'args'                => array(
					'post_id' => array(
						'required'          => true,
						'validate_callback' => function ( $value ) {
							return absint( $value ) > 0;
						},
						'sanitize_callback' => 'absint',
					),
				),
			)
		);
	}

	public function plugins_response() {
		$plugins = $this->detect_plugins();
		return rest_ensure_response(
			array(
				'ok'           => true,
				'bridge'       => 'orbitpress-seo-bridge/1.0.0',
				'rankmath'     => (bool) $plugins['rankmath'],
				'yoast'        => (bool) $plugins['yoast'],
				'has_seo'      => (bool) ( $plugins['rankmath'] || $plugins['yoast'] ),
			)
		);
	}

	public function permission( WP_REST_Request $request ) {
		$post_id = absint( $request->get_param( 'post_id' ) );
		$post    = get_post( $post_id );
		if ( ! $post ) {
			return new WP_Error( 'orbitpress_invalid_post', 'A valid post ID is required.', array( 'status' => 404 ) );
		}
		$post_type = get_post_type_object( $post->post_type );
		if ( ! $post_type || empty( $post_type->cap->edit_posts ) ) {
			return new WP_Error( 'orbitpress_unsupported_type', 'This post type cannot be edited.', array( 'status' => 400 ) );
		}
		if ( ! current_user_can( 'edit_post', $post_id ) ) {
			return new WP_Error( 'orbitpress_forbidden', 'You cannot edit this post.', array( 'status' => 403 ) );
		}
		return true;
	}

	private function text( $request, $key, $limit = 2000 ) {
		$value = $request->get_param( $key );
		if ( $value === null || $value === '' ) {
			return null;
		}
		return function_exists( 'wp_filter_nohtml_kses' )
			? mb_substr( wp_filter_nohtml_kses( (string) $value ), 0, $limit )
			: mb_substr( sanitize_text_field( (string) $value ), 0, $limit );
	}

	private function url( $request, $key ) {
		$value = $request->get_param( $key );
		if ( $value === null || $value === '' ) {
			return null;
		}
		return esc_url_raw( (string) $value );
	}

	public function write_seo_meta( WP_REST_Request $request ) {
		$post_id = absint( $request->get_param( 'post_id' ) );
		$plugins = $this->detect_plugins();

		$focus   = $this->text( $request, 'focus_keyphrase', 191 );
		$title   = $this->text( $request, 'seo_title', 200 );
		$desc    = $this->text( $request, 'seo_description', 320 );
		$canon   = $this->url( $request, 'canonical_url' );
		$ogTitle = $this->text( $request, 'og_title', 200 );
		$ogDesc  = $this->text( $request, 'og_description', 320 );
		$ogImg   = $this->url( $request, 'og_image' );
		$twTitle = $this->text( $request, 'twitter_title', 200 );
		$twDesc  = $this->text( $request, 'twitter_description', 320 );
		$twImg   = $this->url( $request, 'twitter_image' );
		$score   = $request->get_param( 'score' );
		$schema  = $this->text( $request, 'schema_type', 40 );
		$index   = $request->get_param( 'robots_index' );
		$second  = $request->get_param( 'secondary_keyphrases' );
		if ( is_array( $second ) ) {
			$second = array_values( array_filter( array_map(
				static function ( $k ) {
					return mb_substr( sanitize_text_field( (string) $k ), 0, 191 );
				},
				$second
			), 'strlen' ) );
		} else {
			$second = null;
		}

		$updates = array();
		$set     = function ( $meta_key, $value ) use ( $post_id, &$updates ) {
			if ( $value === null ) {
				return;
			}
			$current = get_post_meta( $post_id, $meta_key, true );
			if ( (string) $current === (string) $value ) {
				$updates[ $meta_key ] = 'unchanged';
				return;
			}
			$done = update_post_meta( $post_id, $meta_key, $value );
			$updates[ $meta_key ] = $done ? 'updated' : 'failed';
		};

		if ( $plugins['rankmath'] ) {
			$set( 'rank_math_title', $title );
			$set( 'rank_math_description', $desc );
			if ( $focus !== null ) {
				$km = $focus;
				if ( is_array( $second ) && count( $second ) ) {
					$km = implode( ',', array_merge( array( $focus ), array_slice( $second, 0, 4 ) ) );
				}
				$set( 'rank_math_focus_keyword', $km );
			}
			$set( 'rank_math_canonical_url', $canon );
			$set( 'rank_math_facebook_title', $ogTitle );
			$set( 'rank_math_facebook_description', $ogDesc );
			$set( 'rank_math_facebook_image', $ogImg );
			$set( 'rank_math_twitter_title', $twTitle );
			$set( 'rank_math_twitter_description', $twDesc );
			$set( 'rank_math_twitter_image', $twImg );
			if ( $score !== null ) {
				$set( 'rank_math_seo_score', (string) max( 0, min( 100, absint( $score ) ) ) );
			}
			// When OrbitPress emits its own complete Recipe JSON-LD, turn RM schema
			// off for that post to prevent two competing recipe graphs.
			if ( $schema === 'recipe' || $schema === 'off' ) {
				$set( 'rank_math_rich_snippet', 'off' );
			}
			if ( is_array( $second ) ) {
				$set( 'rank_math_secondary_focus_keywords', wp_json_encode( array_map(
					static function ( $keyword ) {
						return array( 'keyword' => $keyword, 'score' => 0 );
					},
					array_slice( $second, 0, 4 )
				) ) );
			}
			// rank_math_robots is stored as a serialized array.
			if ( $index !== null ) {
				$robots = $index ? array( 'index', 'follow' ) : array( 'noindex', 'nofollow' );
				update_post_meta( $post_id, 'rank_math_robots', $robots );
				$updates['rank_math_robots'] = 'updated';
			}
		}

		if ( $plugins['yoast'] ) {
			$set( '_yoast_wpseo_title', $title );
			$set( '_yoast_wpseo_metadesc', $desc );
			$set( '_yoast_wpseo_focuskw', $focus );
			$set( '_yoast_wpseo_canonical', $canon );
			$set( '_yoast_wpseo_opengraph-title', $ogTitle );
			$set( '_yoast_wpseo_opengraph-description', $ogDesc );
			$set( '_yoast_wpseo_opengraph-image', $ogImg );
			$set( '_yoast_wpseo_twitter-title', $twTitle );
			$set( '_yoast_wpseo_twitter-description', $twDesc );
			$set( '_yoast_wpseo_twitter-image', $twImg );
			if ( $score !== null ) {
				// Yoast stores an internal point score (not 0..100); a high value
				// renders green until the editor recalculates it.
				$set( '_yoast_wpseo_linkdex', (string) max( 0, min( 100, absint( $score ) ) ) );
			}
			if ( $index !== null ) {
				update_post_meta( $post_id, '_yoast_wpseo_meta-robots-noindex', $index ? '0' : '1' );
				$updates['_yoast_wpseo_meta-robots-noindex'] = 'updated';
			}
		}

		if ( ! $plugins['rankmath'] && ! $plugins['yoast'] ) {
			// Still persist the metadata so a plugin installed later can pick it up.
			$store = array_filter( array(
				'focus_keyphrase'      => $focus,
				'seo_title'            => $title,
				'seo_description'      => $desc,
				'canonical_url'        => $canon,
				'og_title'             => $ogTitle,
				'og_description'       => $ogDesc,
				'og_image'             => $ogImg,
				'score'                => $score === null ? null : (string) absint( $score ),
			), static function ( $v ) { return $v !== null; } );
			if ( $store ) {
				update_post_meta( $post_id, '_orbitpress_seo_fallback', wp_json_encode( $store ) );
				$updates['_orbitpress_seo_fallback'] = 'updated';
			}
		}

		if ( empty( $updates ) ) {
			return new WP_Error( 'orbitpress_no_update', 'No SEO fields were provided.', array( 'status' => 400 ) );
		}

		clean_post_cache( $post_id );

		return rest_ensure_response(
			array(
				'ok'      => true,
				'post_id' => $post_id,
				'plugins' => $plugins,
				'fields'  => $updates,
			)
		);
	}
}

new OrbitPress_SEO_Bridge();

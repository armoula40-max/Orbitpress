'use strict';
/*
 * feedspy.js — FeedSpy-style analyzer layer for the Facebook & Pinterest screens.
 *
 * Injected on top of the original OrbitPress UI (which it does not modify on disk
 * beyond this script + stylesheet): adds period filters, sort/search, min-max
 * metric filters, hide-viewed, CSV export, weekday activity chart and a full
 * Arabic AI report — fed by the built-in server scraper or the official API scans.
 */
(function () {
  var AR = {
    period: 'الفترة', last7: 'آخر 7 أيام', last30: 'آخر 30 يوم', last90: 'آخر 90 يوم', all: 'كل الفترات', custom: 'مخصص',
    search: 'بحث بالكلمة…', sort: 'الترتيب', viral: 'الأكثر فيروسية', likes: 'التفاعلات', saves: 'الحفظ', comments: 'التعليقات', shares: 'المشاركات',
    newest: 'الأحدث', oldest: 'الأقدم', min: 'أدنى', max: 'أقصى', hideViewed: 'إخفاء المشاهَد',
    exportCsv: 'تصدير CSV', aiReport: 'تقرير AI شامل', posts: 'منشور', avgEng: 'متوسط التفاعل', bestSlot: 'أفضل توقيت', topViral: 'أعلى Viral',
    activity: 'النشاط حسب اليوم', seen: 'تمت مشاهدته', openPost: 'فتح', connectHint: 'اربط الحساب من الإعدادات لنتائج أعمق',
  };
  var WEEK_AR = ['الأحد', 'الاثنين', 'الثلاثاء', 'الأربعاء', 'الخميس', 'الجمعة', 'السبت'];

  // ---- state ----------------------------------------------------------------
  var spy = {
    facebook: { jobId: null, posts: [], stats: null, source: '', filters: { period: 'all', query: '', sort: 'viral', min: '', max: '' }, hideViewed: false, metric: 'reactions' },
    pinterest: { jobId: null, posts: [], stats: null, source: '', filters: { period: 'all', query: '', sort: 'viral', min: '', max: '' }, hideViewed: false, metric: 'saves' },
  };

  function viewedKey(platform) { return 'orbitpress-viewed:' + platform; }
  function viewedSet(platform) {
    try { return new Set(JSON.parse(localStorage.getItem(viewedKey(platform)) || '[]')); } catch (e) { return new Set(); }
  }
  function saveViewed(platform, set) {
    try { localStorage.setItem(viewedKey(platform), JSON.stringify([...set].slice(-5000))); } catch (e) { /* private mode */ }
  }

  function num(v) { var n = Number(v); return Number.isFinite(n) ? n : null; }
  function engagement(post) {
    return (num(post.reactions) || 0) + (num(post.saves) || 0) * 2 + (num(post.comments) || 0) * 2 + (num(post.shares) || 0) * 3;
  }
  function metricValue(post, metric) {
    if (metric === 'viralScore') return num(post.viralScore);
    if (metric === 'engagement') return engagement(post);
    return num(post[metric]);
  }

  // ---- client-side fallback filtering (also used for Graph/API scans) --------
  function applyFilters(posts, platform) {
    var f = spy[platform].filters;
    var list = posts.slice();
    if (f.period && f.period !== 'all') {
      var start = null; var end = null;
      if (f.period === 'custom') {
        if (f.start) start = new Date(f.start);
        if (f.end) end = new Date(new Date(f.end).getTime() + 86399999);
      } else {
        start = new Date(Date.now() - (Number(f.period) || 30) * 86400000);
      }
      list = list.filter(function (p) {
        var d = p.publishedAt ? new Date(p.publishedAt) : null;
        if (!d || isNaN(d)) return false;
        if (start && d < start) return false;
        if (end && d > end) return false;
        return true;
      });
    }
    if (f.query) {
      var q = f.query.toLowerCase();
      list = list.filter(function (p) { return (String(p.title || '') + ' ' + String(p.text || '')).toLowerCase().indexOf(q) !== -1; });
    }
    if (f.min !== '' || f.max !== '') {
      var metric = spy[platform].metric;
      list = list.filter(function (p) {
        var v = metricValue(p, metric);
        if (v == null) return false;
        if (f.min !== '' && v < Number(f.min)) return false;
        if (f.max !== '' && v > Number(f.max)) return false;
        return true;
      });
    }
    var key = f.sort === 'likes' ? (platform === 'pinterest' ? 'saves' : 'reactions') : f.sort;
    list.sort(function (a, b) {
      if (key === 'newest') return (new Date(b.publishedAt) || 0) - (new Date(a.publishedAt) || 0);
      if (key === 'oldest') return (new Date(a.publishedAt) || 2147483647000) - (new Date(b.publishedAt) || 2147483647000);
      if (key === 'viral') return (num(b.viralScore) || 0) - (num(a.viralScore) || 0);
      return (num(b[key]) || 0) - (num(a[key]) || 0);
    });
    if (spy[platform].hideViewed) {
      var seen = viewedSet(platform);
      list = list.filter(function (p) { return !seen.has(postKey(p)); });
    }
    return list;
  }

  function computeStats(posts) {
    var withMetrics = 0; var total = 0; var topViral = 0;
    var byWeekday = [0, 1, 2, 3, 4, 5, 6].map(function (wd) { return { weekday: wd, count: 0, engagement: 0 }; });
    var slots = {};
    posts.forEach(function (post) {
      var e = engagement(post);
      total += e;
      if (e > 0) withMetrics += 1;
      if ((num(post.viralScore) || 0) > topViral) topViral = num(post.viralScore) || 0;
      var d = post.publishedAt ? new Date(post.publishedAt) : null;
      if (d && !isNaN(d)) {
        byWeekday[d.getUTCDay()].count += 1;
        byWeekday[d.getUTCDay()].engagement += e;
        var k = d.getUTCDay() + '-' + d.getUTCHours();
        slots[k] = slots[k] || { weekday: d.getUTCDay(), hour: d.getUTCHours(), count: 0, engagement: 0 };
        slots[k].count += 1; slots[k].engagement += e;
      }
    });
    var best = Object.keys(slots).map(function (k) { var s = slots[k]; s.avg = s.engagement / s.count; return s; }).sort(function (a, b) { return b.avg - a.avg; })[0] || null;
    return {
      count: posts.length,
      withMetricsCount: withMetrics,
      avgEngagement: posts.length ? Math.round((total / posts.length) * 10) / 10 : 0,
      topViralScore: Math.round(topViral * 10) / 10,
      byWeekday: byWeekday,
      bestSlot: best,
    };
  }

  // ---- rendering --------------------------------------------------------------
  function esc(v) { try { return escapeHtml(v); } catch (e) { return String(v == null ? '' : v); } }
  function postKey(p) { return p.url || p.id || p.title; }
  function spyNotice(message, kind) { try { notice(message, kind); } catch (e) { console.log('[orbitpress]', kind, message); } }
  function fmtNum(v) { return v == null ? '—' : Number(v).toLocaleString('en-US'); }
  function fmtDate(v) {
    if (!v) return 'بدون تاريخ';
    var d = new Date(v);
    if (isNaN(d)) return 'بدون تاريخ';
    var age = Date.now() - d.getTime();
    if (age < 86400000) return 'منذ ' + Math.max(1, Math.round(age / 3600000)) + ' ساعة';
    if (age < 30 * 86400000) return 'منذ ' + Math.round(age / 86400000) + ' يوم';
    return d.toISOString().slice(0, 10);
  }
  function viralClass(score) {
    if (score == null) return 'v-none';
    if (score >= 70) return 'v-hot';
    if (score >= 40) return 'v-warm';
    return 'v-cold';
  }

  function spyToolbar(platform) {
    var metrics = platform === 'pinterest'
      ? '<option value="saves">الحفظ</option><option value="comments">التعليقات</option><option value="viralScore">Viral</option>'
      : '<option value="reactions">التفاعلات</option><option value="comments">التعليقات</option><option value="shares">المشاركات</option><option value="viralScore">Viral</option>';
    var id = platform === 'pinterest' ? 'spyP' : 'spyF';
    return '' +
      '<div class="spy-toolbar" id="' + id + 'Toolbar">' +
        '<div class="spy-row">' +
          '<div class="spy-cell"><label>' + AR.period + '</label><select id="' + id + 'Period">' +
            '<option value="7">' + AR.last7 + '</option><option value="30">' + AR.last30 + '</option><option value="90">' + AR.last90 + '</option><option value="all" selected>' + AR.all + '</option><option value="custom">' + AR.custom + '</option></select>' +
            '<div class="spy-custom" id="' + id + 'CustomRange" style="display:none"><input type="date" id="' + id + 'Start"><input type="date" id="' + id + 'End"></div></div>' +
          '<div class="spy-cell"><label>' + AR.sort + '</label><select id="' + id + 'Sort">' +
            '<option value="viral" selected>' + AR.viral + '</option>' +
            (platform === 'pinterest' ? '<option value="likes">' + AR.saves + '</option>' : '<option value="likes">' + AR.likes + '</option>') +
            '<option value="comments">' + AR.comments + '</option>' + (platform === 'pinterest' ? '' : '<option value="shares">' + AR.shares + '</option>') +
            '<option value="newest">' + AR.newest + '</option><option value="oldest">' + AR.oldest + '</option></select></div>' +
          '<div class="spy-cell grow"><label>بحث في النتائج</label><input id="' + id + 'Search" type="search" placeholder="' + AR.search + '"></div>' +
        '</div>' +
        '<div class="spy-row">' +
          '<div class="spy-cell"><label>مقياس الفلترة</label><select id="' + id + 'Metric">' + metrics + '</select></div>' +
          '<div class="spy-cell"><label>' + AR.min + '</label><input id="' + id + 'Min" type="number" min="0" placeholder="0"></div>' +
          '<div class="spy-cell"><label>' + AR.max + '</label><input id="' + id + 'Max" type="number" min="0" placeholder="—"></div>' +
          '<div class="spy-cell spy-check"><label class="spy-switch"><input type="checkbox" id="' + id + 'HideViewed"><span>' + AR.hideViewed + '</span></label></div>' +
          '<div class="spy-cell spy-actions"><button type="button" class="small-button" id="' + id + 'Csv">' + AR.exportCsv + '</button>' +
          '<button type="button" class="small-button spy-ai" id="' + id + 'AiReport">🧠 ' + AR.aiReport + '</button>' +
          '<select id="' + id + 'TopN" aria-label="عدد النتائج المحوّلة"><option value="3">3</option><option value="5" selected>5</option><option value="10">10</option></select>' +
          '<button type="button" class="small-button spy-viral" id="' + id + 'ToKeywords">⚡ حول الأعلى إلى كلمات</button></div>' +
        '</div>' +
      '</div>';
  }

  function renderStats(platform) {
    var stats = spy[platform].stats || computeStats(spy[platform].posts);
    var id = platform === 'pinterest' ? 'spyP' : 'spyF';
    var host = document.getElementById(id + 'Stats');
    if (!host) return;
    if (!spy[platform].posts.length) { host.innerHTML = ''; return; }
    var maxDay = Math.max.apply(null, [1].concat(stats.byWeekday.map(function (d) { return d.engagement; })));
    host.innerHTML =
      '<div class="spy-stats">' +
        '<div class="spy-stat"><b>' + stats.count + '</b><span>' + AR.posts + '</span></div>' +
        '<div class="spy-stat"><b>' + fmtNum(stats.avgEngagement) + '</b><span>' + AR.avgEng + '</span></div>' +
        '<div class="spy-stat"><b>' + (stats.bestSlot ? WEEK_AR[stats.bestSlot.weekday] + ' ' + String(stats.bestSlot.hour).padStart(2, '0') + ':00' : '—') + '</b><span>' + AR.bestSlot + ' (UTC)</span></div>' +
        '<div class="spy-stat"><b>' + fmtNum(stats.topViralScore) + '</b><span>' + AR.topViral + '</span></div>' +
      '</div>' +
      '<div class="spy-chart"><p class="spy-chart-title">' + AR.activity + '</p><div class="spy-bars">' +
        stats.byWeekday.map(function (d) {
          var h = Math.round((d.engagement / maxDay) * 100);
          return '<div class="spy-bar" title="' + WEEK_AR[d.weekday] + ' — تفاعل ' + fmtNum(d.engagement) + ' عبر ' + d.count + ' منشور"><i style="height:' + Math.max(3, h) + '%" class="' + (d.engagement === maxDay && d.engagement > 0 ? 'peak' : '') + '"></i><span>' + WEEK_AR[d.weekday].slice(0, 3) + '</span></div>';
        }).join('') +
      '</div></div>';
  }

  function renderList(platform) {
    var isPin = platform === 'pinterest';
    var resultsId = isPin ? 'pinterestResults' : platform + 'Results';
    var host = document.getElementById(resultsId);
    if (!host) return;
    var all = spy[platform].posts;
    if (!all.length) { return; } // keep the original empty/notice state
    var filtered = applyFilters(all, platform);
    var stats = spy[platform].stats || computeStats(all);
    var seen = viewedSet(platform);
    // A metric the source never reports (every post 0/empty) must not be
    // rendered as a real measurement.
    var reported = {
      reactions: all.some(function (p) { return Number(p.reactions) > 0; }),
      saves: all.some(function (p) { return Number(p.saves) > 0; }),
      comments: all.some(function (p) { return Number(p.comments) > 0; }),
      shares: all.some(function (p) { return Number(p.shares) > 0; }),
    };
    var rows = filtered.map(function (post, index) {
      var isSeen = seen.has(postKey(post));
      var sourceHost = '';
      try { sourceHost = post.outboundUrl ? new URL(post.outboundUrl).hostname.replace(/^www\./, '') : ''; } catch (e) { sourceHost = ''; }
      var chips =
        (sourceHost ? '<a class="spy-chip spy-source" href="' + esc(post.outboundUrl) + '" target="_blank" rel="noopener">🔗 ' + esc(sourceHost.slice(0, 26)) + '</a>' : '') +
        (reported.reactions && post.reactions != null ? '<span class="spy-chip">👍 ' + fmtNum(post.reactions) + '</span>' : '') +
        (reported.saves && post.saves != null ? '<span class="spy-chip">📌 ' + fmtNum(post.saves) + '</span>' : '') +
        (reported.comments && post.comments != null ? '<span class="spy-chip">💬 ' + fmtNum(post.comments) + '</span>' : '') +
        (reported.shares && post.shares != null ? '<span class="spy-chip">↗ ' + fmtNum(post.shares) + '</span>' : '');
      return '<article class="pin-result spy-post' + (isSeen ? ' seen' : '') + '">' +
        '<div class="pin-result-top"><div class="pin-result-title">' + (post.url ? '<a href="' + esc(post.url) + '" target="_blank" rel="noopener">' + esc(post.title || post.text || ('Untitled ' + (index + 1))) + '</a>' : esc(post.title || post.text || ('Untitled ' + (index + 1)))) + '</div>' +
        '<span class="pin-score ' + viralClass(num(post.viralScore)) + '">' + (post.viralScore == null ? '—' : Number(post.viralScore).toFixed(1)) + '</span></div>' +
        '<div class="pin-meta"><span>🕑 ' + esc(fmtDate(post.publishedAt)) + '</span>' + chips + '</div>' +
        '<div class="spy-post-actions"><button type="button" class="small-button plain spy-seen" data-spy-seen="' + esc(postKey(post)) + '" data-platform="' + platform + '">' + (isSeen ? '✓ شوهد' : AR.seen) + '</button>' +
        (post.url ? '<a class="small-button spy-open" href="' + esc(post.url) + '" target="_blank" rel="noopener">' + AR.openPost + '</a>' : '') + '</div>' +
      '</article>';
    });
    host.innerHTML = rows.length
      ? rows.join('')
      : '<div class="empty">لا نتائج ضمن الفلاتر الحالية. وسّع الفترة أو امسح البحث.</div>';
    host.querySelectorAll('.spy-seen').forEach(function (btn) {
      btn.onclick = function () {
        var set = viewedSet(btn.dataset.platform);
        if (set.has(btn.dataset.spySeen)) set.delete(btn.dataset.spySeen); else set.add(btn.dataset.spySeen);
        saveViewed(btn.dataset.platform, set);
        refresh(btn.dataset.platform);
      };
    });
    var countNote = document.getElementById((isPin ? 'spyP' : platform === 'facebook' ? 'spyF' : 'spyF') + 'Count');
    if (countNote) {
      var cov = spy[platform].coverage;
      var covText = cov && cov.from ? ' · التغطية: ' + cov.from.slice(0, 10) + ' ← ' + cov.to.slice(0, 10) + (cov.complete ? ' (مكتملة ✓)' : ' (حتى ما هو متاح)') : '';
      var pipe = spy[platform].pipeline;
      var REASON_AR = { 'post-cap': 'بلغ حد العدد', 'scroll-cap': 'بلغ حد التمريرات', 'window-covered': 'اكتملت النافذة', 'no-older-posts': 'لا منشورات أقدم بالصفحة', 'no-new-posts': 'توقف ظهور الجديد', 'time-limit': 'انتهت المهلة', 'browser-failed': 'فشل مسار المتصفح' };
      var parts = [];
      if (pipe) {
        if (pipe.resource != null) parts.push('مورد ' + pipe.resource + (pipe.resourceNote ? ' (' + pipe.resourceNote + ')' : ''));
        if (pipe.http != null) parts.push('HTTP ' + pipe.http);
        if (pipe.browser != null) parts.push('متصفح ' + pipe.browser);
        if (pipe.browserUnique != null) parts.push('متصفح ' + pipe.browserUnique + ' (' + (pipe.passes || 0) + ' تمريرة)');
        if (pipe.details) parts.push('تفاصيل عميقة ' + pipe.details);
        if (pipe.enriched) parts.push('إثراء HTTP ' + pipe.enriched);
        if (pipe.photos) parts.push('صور عميقة ' + pipe.photos);
        if (pipe.stoppedBy && REASON_AR[pipe.stoppedBy]) parts.push('توقف: ' + REASON_AR[pipe.stoppedBy]);
      }
      var pipeText = parts.length ? ' · تشخيص: ' + parts.join(' · ') : '';
      countNote.textContent = filtered.length + ' / ' + all.length + (stats.withMetricsCount < all.length ? ' · ' + (all.length - stats.withMetricsCount) + ' بدون مقاييس ظاهرة' : '') + covText + pipeText;
    }
  }

  function refresh(platform) {
    renderStats(platform);
    renderList(platform);
  }

  // ---- CSV export (from the currently displayed, filtered posts) --------------
  function exportCsv(platform) {
    var filtered = applyFilters(spy[platform].posts, platform);
    if (!filtered.length) { spyNotice('لا توجد منشورات للتصدير ضمن الفلاتر الحالية.', 'bad'); return; }
    var header = ['title', 'publishedAt', 'reactions', 'comments', 'shares', 'saves', 'viralScore', 'url'];
    var lines = [header.join(',')];
    filtered.forEach(function (p) {
      lines.push([
        p.title || String(p.text || '').slice(0, 120), p.publishedAt || '', p.reactions == null ? '' : p.reactions,
        p.comments == null ? '' : p.comments, p.shares == null ? '' : p.shares, p.saves == null ? '' : p.saves,
        p.viralScore == null ? '' : p.viralScore, p.url || '',
      ].map(function (v) {
        var t = String(v);
        return /[",\n]/.test(t) ? '"' + t.replace(/"/g, '""') + '"' : t;
      }).join(','));
    });
    var blob = new Blob(['﻿' + lines.join('\r\n')], { type: 'text/csv;charset=utf-8' });
    var a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = 'orbitpress-' + platform + '-' + new Date().toISOString().slice(0, 10) + '.csv';
    a.click();
    setTimeout(function () { URL.revokeObjectURL(a.href); }, 1500);
    spyNotice('تم تصدير ' + filtered.length + ' صفاً إلى CSV (يفتح في Excel).', 'good');
  }

  // ---- Full AI report ---------------------------------------------------------
  function renderAiReport(platform, report) {
    var panel = document.getElementById(platform + 'AiReport');
    if (!panel) return;
    var chips = function (list) { return (list || []).length ? '<div class="keyword-cloud">' + (list || []).slice(0, 16).map(function (k) { return '<span class="keyword-chip">' + esc(k) + '</span>'; }).join('') + '</div>' : ''; };
    var listBlock = function (title, list) { return (list || []).length ? '<h4>' + esc(title) + '</h4><ul class="spy-ai-list">' + list.map(function (x) { return '<li>' + esc(x) + '</li>'; }).join('') + '</ul>' : ''; };
    panel.innerHTML = '<div dir="rtl" class="spy-ai-report">' +
      '<h3>' + esc(report.headline || 'تقرير ذكاء المحتوى') + '</h3>' +
      (report.executiveSummary ? '<p>' + esc(report.executiveSummary) + '</p>' : '') +
      listBlock('لماذا انتشرت المنشورات الأعلى', report.viralPatterns) +
      listBlock('المواضيع الرابحة', report.topics) +
      listBlock('عناوين وزوايا مقترحة', report.contentAngles) +
      listBlock('خطة عمل مقترحة', report.planOfAction) +
      (report.bestTimeAdvice ? '<h4>أفضل توقيت للنشر</h4><p>' + esc(report.bestTimeAdvice) + '</p>' : '') +
      '<h4>كلمات مفتاحية</h4>' + chips(report.primaryKeywords) + chips(report.longTailKeywords) +
    '</div>';
  }

  function requestAiReport(platform) {
    var panel = document.getElementById(platform + 'AiReport');
    var filtered = applyFilters(spy[platform].posts, platform);
    if (!filtered.length) { spyNotice('امسح المنصة أولاً أو وسّع الفلاتر.', 'bad'); return; }
    panel.innerHTML = '<h3>🧠 جارٍ بناء تقرير الذكاء الاصطناعي…</h3><p>يُحلَّل أعلى المنشورات تفاعلاً مع الإحصاءات.</p>';
    var stats = spy[platform].stats || computeStats(spy[platform].posts);
    fetch('/api/feedspy/report', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        platform: platform,
        language: 'ar',
        source: spy[platform].source,
        period: spy[platform].filters.period,
        stats: stats,
        posts: filtered.slice(0, 15),
        siteId: (typeof state!=="undefined"&&state.workspace&&state.workspace.activeSiteId) || 'site-default',
      }),
    })
      .then(function (r) { return r.json(); })
      .then(function (result) {
        if (!result.ok) throw new Error(result.message || 'تعذر التحليل.');
        renderAiReport(platform, result.report || {});
        spyNotice('اكتمل تقرير الذكاء الاصطناعي.', 'good');
      })
      .catch(function (error) {
        panel.innerHTML = '<h3>تعذر التحليل</h3><p>' + esc(error.message || 'تحقق من إعدادات Article API ثم أعد المحاولة.') + '</p>';
        spyNotice(error.message || 'فشل تقرير AI.', 'bad');
      });
  }

  // ---- toolbar wiring -----------------------------------------------------------
  function installToolbar(platform) {
    var resultsId = platform === 'pinterest' ? 'pinterestResults' : platform + 'Results';
    var host = document.getElementById(resultsId);
    if (!host) return;
    var card = host.closest('.card');
    if (!card || card.querySelector('.spy-toolbar')) return;
    var id = platform === 'pinterest' ? 'spyP' : 'spyF';
    var wrap = document.createElement('div');
    wrap.innerHTML = spyToolbar(platform) + '<div id="' + id + 'Stats"></div><p class="helper spy-count" id="' + id + 'Count"></p>';
    card.insertBefore(wrap, host);
    var f = spy[platform].filters;
    var R = function () { refresh(platform); };
    document.getElementById(id + 'Period').onchange = function () {
      f.period = this.value;
      document.getElementById(id + 'CustomRange').style.display = this.value === 'custom' ? 'grid' : 'none';
      R();
    };
    document.getElementById(id + 'Start').onchange = function () { f.start = this.value; R(); };
    document.getElementById(id + 'End').onchange = function () { f.end = this.value; R(); };
    document.getElementById(id + 'Sort').onchange = function () { f.sort = this.value; R(); };
    document.getElementById(id + 'Search').oninput = function () { f.query = this.value; R(); };
    document.getElementById(id + 'Metric').onchange = function () { spy[platform].metric = this.value; R(); };
    document.getElementById(id + 'Min').oninput = function () { f.min = this.value; R(); };
    document.getElementById(id + 'Max').oninput = function () { f.max = this.value; R(); };
    document.getElementById(id + 'HideViewed').onchange = function () { spy[platform].hideViewed = this.checked; R(); };
    document.getElementById(id + 'Csv').onclick = function () { exportCsv(platform); };
    document.getElementById(id + 'AiReport').onclick = function () { requestAiReport(platform); };
    document.getElementById(id + 'ToKeywords').onclick = function () { sendTopToKeywords(platform); };
    var analyzeBtn = document.getElementById(platform === 'pinterest' ? 'analyzePinterest' : 'analyzeFacebook');
    if (analyzeBtn && analyzeBtn.parentElement) {
      var note = document.createElement('p');
      note.className = 'helper';
      note.textContent = 'زر "Analyze with AI" يعمل كما في السابق — زر "تقرير AI شامل" في شريط FeedSpy يُنتج تقريراً عربياً كاملاً.';
      analyzeBtn.parentElement.appendChild(note);
    }
  }

  /**
   * Viral -> article handoff: turn the strongest posts of the current view
   * into keyword queue entries. Pinterest titles are listicle headlines
   * ("X: 7 Proven Steps to Y"), so the keyword is the topic before the colon
   * or pipe, with listicle numbering and hashtags stripped.
   */
  function pinKeyword(post) {
    var raw = String(post.title || post.text || '');
    raw = raw.split('|')[0].split(' – ')[0].split(' - ')[0];
    var colon = raw.indexOf(':');
    if (colon > 12) raw = raw.slice(0, colon);
    raw = raw.replace(/#\S+/g, ' ').replace(/^\s*\d+\s+/, ' ');
    try { raw = raw.replace(/[^\p{L}\p{N}\s'&-]/gu, ' '); } catch (e) { raw = raw.replace(/[^\w\s'&-]/g, ' '); }
    raw = raw.replace(/\s+/g, ' ').trim();
    if (raw.split(' ').length < 2 && post.boardName) raw = String(post.boardName);
    return raw.slice(0, 70).trim();
  }

  function pack(post, keyword, extra) {
    if (!keyword) return null;
    var row = {
      keyword: keyword,
      pinTitle: String(post.title || '').slice(0, 200),
      pinText: String(post.text || '').slice(0, 600),
      pinUrl: post.url || '',
      sourceUrl: post.outboundUrl || '',
      imageUrl: post.imageUrl || '',
      saves: post.saves == null ? null : Number(post.saves),
      reactions: post.reactions == null ? null : Number(post.reactions),
      viralScore: post.viralScore == null ? null : Number(post.viralScore),
      platform: 'pinterest',
    };
    if (extra) { row.angle = extra.angle || ''; row.contentType = extra.contentType || ''; }
    return row;
  }

  function finishHandoff(rows, viaAi) {
    if (!rows.length) return spyNotice('لا توجد نتائج صالحة للتحويل ضمن الفلاتر الحالية.', 'bad');
    if (typeof window.__orbitpressEnqueueKeywords !== 'function') {
      return spyNotice('واجهة الكلمات غير متاحة — أعد تحميل الصفحة.', 'bad');
    }
    var result = window.__orbitpressEnqueueKeywords(rows) || {};
    if (result.added) {
      spyNotice('أُضيفت ' + result.added + ' كلمة ' + (viaAi ? 'من محلل AI ' : '') + 'إلى طابور الاستوديو' + (result.duplicates ? ' (' + result.duplicates + ' مكررة/غير صالحة)' : '') + '.', 'good');
    } else {
      spyNotice(result.message || 'لم تُضف أي كلمة — اختر تصنيفاً في شاشة الاستوديو أولاً.', 'bad');
    }
  }

  /**
   * Viral -> article handoff. The app already ships an AI analyzer, so the
   * keyword comes from it (per post, in the site's language) and the crude
   * headline trimmer is only the fallback when the AI is unreachable.
   */
  function sendTopToKeywords(platform) {
    var id = platform === 'pinterest' ? 'spyP' : 'spyF';
    var select = document.getElementById(id + 'TopN');
    var count = Number(select && select.value) || 5;
    var top = applyFilters(spy[platform].posts, platform).slice().sort(function (a, b) {
      return (Number(b.viralScore) || 0) - (Number(a.viralScore) || 0);
    }).slice(0, count);
    if (!top.length) return spyNotice('لا توجد نتائج ضمن الفلاتر الحالية.', 'bad');
    var button = document.getElementById(id + 'ToKeywords');
    if (button) { button.disabled = true; button.textContent = '🧠 يستخرج الكلمات…'; }

    fetch('/api/bridge/call', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        type: 'viralKeywords',
        language: 'en',
        posts: top.map(function (post) {
          return {
            id: post.id, title: post.title, text: post.text, boardName: post.boardName,
            outboundUrl: post.outboundUrl, saves: post.saves, reactions: post.reactions,
            comments: post.comments, viralScore: post.viralScore,
          };
        }),
        siteId: (typeof state !== 'undefined' && state.workspace && state.workspace.activeSiteId) || 'site-default',
      }),
    })
      .then(function (r) { return r.json(); })
      .then(function (result) {
        var items = (result && result.ok && Array.isArray(result.items)) ? result.items : [];
        var byId = {};
        items.forEach(function (item) { byId[String(item.id)] = item; });
        var rows = top.map(function (post) {
          var ai = byId[String(post.id)];
          // AI keyword when we have one, headline trimmer otherwise.
          return pack(post, (ai && ai.keyword) || pinKeyword(post), ai);
        }).filter(Boolean);
        finishHandoff(rows, items.length > 0);
      })
      .catch(function () {
        finishHandoff(top.map(function (post) { return pack(post, pinKeyword(post)); }).filter(Boolean), false);
      })
      .then(function () {
        if (button) { button.disabled = false; button.textContent = '⚡ حول الأعلى إلى كلمات'; }
      });
  }

  // ---- intercept scan results to seed the spy store ------------------------------
  function normalizePostMetrics(post) {
    if (post.reactions == null && post.likes != null) post.reactions = post.likes;
    return post;
  }

  function seed(platform, parsed) {
    var s = spy[platform];
    s.jobId = parsed.jobId || null;
    if (Array.isArray(parsed.posts)) s.posts = parsed.posts.map(normalizePostMetrics);
    s.stats = parsed.stats || computeStats(s.posts);
    s.coverage = parsed.coverage || null;
    s.pipeline = parsed.pipeline || null;
    s.source = parsed.source || s.source || '';
    if (typeof parsed.source === 'string' && parsed.source) s.source = parsed.source;
    else if (parsed.source && parsed.source.name) s.source = parsed.source.name;
    else if (parsed.source && parsed.source.username) s.source = parsed.source.username;
  }

  function wrapCallbacks() {
    var originalSocial = window.__socialScanResult;
    window.__socialScanResult = function (raw) {
      try {
        var parsed = typeof raw === 'string' ? JSON.parse(raw) : raw;
        if (parsed && parsed.ok !== false && (parsed.platform === 'facebook')) seed('facebook', parsed);
      } catch (e) { /* fall through */ }
      if (typeof originalSocial === 'function') originalSocial(raw);
      refresh('facebook');
    };
    var originalPinterest = window.__pinterestScanResult;
    window.__pinterestScanResult = function (raw) {
      try {
        var parsed = typeof raw === 'string' ? JSON.parse(raw) : raw;
        if (parsed && parsed.ok !== false) seed('pinterest', parsed);
      } catch (e) { /* fall through */ }
      if (typeof originalPinterest === 'function') originalPinterest(raw);
      refresh('pinterest');
    };
    // API scans (Graph API / Pinterest API v5 / VPS) populate the global state
    // objects directly — read them after those flows finish.
    function fbState() { try { return socialState.facebook; } catch (e) { return null; } }
    function pinState() { try { return pinterestState; } catch (e) { return null; } }
    function seedFromFacebookState() {
      var st = fbState();
      if (st && st.posts && st.posts.length) {
        spy.facebook.posts = st.posts.map(normalizePostMetrics);
        spy.facebook.stats = computeStats(spy.facebook.posts);
        if (st.source) spy.facebook.source = typeof st.source === 'string' ? st.source : (st.source.name || st.source.username || spy.facebook.source);
        return true;
      }
      return false;
    }
    function seedFromPinterestState() {
      var st = pinState();
      if (st && st.posts && st.posts.length) {
        spy.pinterest.posts = st.posts.map(normalizePostMetrics);
        spy.pinterest.stats = computeStats(spy.pinterest.posts);
        if (st.source) spy.pinterest.source = typeof st.source === 'string' ? st.source : spy.pinterest.source;
        return true;
      }
      return false;
    }

    var originalFacebookApi = window.facebookGraphApiScan;
    if (typeof originalFacebookApi === 'function') {
      window.facebookGraphApiScan = function () {
        return originalFacebookApi.apply(this, arguments).finally(function () { seedFromFacebookState(); refresh('facebook'); });
      };
    }
    var originalPinterestApi = window.pinterestApiScan;
    if (typeof originalPinterestApi === 'function') {
      window.pinterestApiScan = function () {
        return originalPinterestApi.apply(this, arguments).finally(function () { seedFromPinterestState(); refresh('pinterest'); });
      };
    }
    // The VPS button re-renders through the original renderer — wrap it as a hook.
    var originalRenderSocial = window.renderSocialResults;
    if (typeof originalRenderSocial === 'function') {
      window.renderSocialResults = function (platform) {
        originalRenderSocial(platform);
        if (platform === 'facebook' && seedFromFacebookState()) refresh('facebook');
      };
    }
    var originalRenderPinterest = window.renderPinterestResults;
    if (typeof originalRenderPinterest === 'function') {
      window.renderPinterestResults = function () {
        originalRenderPinterest();
        if (seedFromPinterestState()) refresh('pinterest');
      };
    }
  }

  // ---- server sessions UI (login without API keys or cookie uploads) ---------------
  function sessionCardHtml(statuses) {
    var one = function (platform, label, icon) {
      var st = (statuses && statuses[platform]) || {};
      var connected = !!st.connected;
      return '<div class="spy-session ' + (connected ? 'on' : 'off') + '">' +
        '<div class="spy-session-head"><b>' + icon + ' ' + label + '</b>' +
        '<span class="connection-state ' + (connected ? 'ready' : 'warn') + '">' + (connected ? '● متصل — ' + esc(st.label || '') : 'غير متصل') + '</span></div>' +
        '<div id="' + platform + 'SessionForm" class="spy-session-form" style="display:' + (connected ? 'none' : 'grid') + '">' +
          '<input type="text" id="' + platform + 'LoginUser" placeholder="البريد الإلكتروني أو اسم المستخدم" autocomplete="off">' +
          '<input type="password" id="' + platform + 'LoginPass" placeholder="كلمة المرور" autocomplete="off">' +
          '<button type="button" class="small-button" id="' + platform + 'LoginBtn">تسجيل الدخول عبر متصفح السيرفر</button>' +
          '<p class="helper">يبقى تسجيل الدخول على السيرفر فقط، ويستخدمه الماسح المدمج. لا API ولا رفع كوكيز. إذا طُلب رمز تحقق (2FA) سيظهر حقل إدخاله هنا فوراً.</p>' +
          '<details class="spy-cookie-import">' +
            '<summary>ظهر CAPTCHA أو رفض الدخول؟ استورد الكوكيز من متصفحك (الأضمنن)</summary>' +
            '<p class="helper">1) افتح ' + label + ' في متصفحك العادي وسجّل دخولك. 2) ثبّت إضافة <b>Cookie-Editor</b> ثم افتحها وأنت على صفحة ' + label + ' واضغط <b>Export</b> (انسخ JSON). 3) الصق النص هنا واضغط استيراد — تبقى الكوكيز على السيرفر فقط.</p>' +
            '<textarea id="' + platform + 'CookieImport" rows="4" dir="ltr" style="width:100%;font-family:monospace;font-size:11px" placeholder=\'[{"name":"_auth","value":"1",...}]\'></textarea>' +
            '<button type="button" class="small-button" id="' + platform + 'ImportBtn">استيراد الكوكيز والاتصال</button>' +
          '</details>' +
        '</div>' +
        '<div id="' + platform + 'VerifyStep" class="spy-verify" style="display:none"></div>' +
        '<div class="spy-session-actions" style="display:' + (connected ? 'block' : 'none') + '">' +
          '<button type="button" class="small-button" id="' + platform + 'RecheckBtn">إعادة فحص الاتصال</button> ' +
          '<button type="button" class="small-button remove" id="' + platform + 'LogoutBtn">قطع الاتصال</button>' +
        '</div>' +
      '</div>';
    };
    return '<section class="card" id="spySessionsCard"><div class="connection-line"><h2>الحسابات المرتبطة — تسجيل دخول السيرفر</h2><span class="connection-state ready">جديد</span></div>' +
      '<p class="helper">بديل كامل لـ API والكوكيز: دخول واحد يبقى محفوظاً في متصفح السيرفر الدائم ويستخدمه الماسح في Facebook و Pinterest.</p>' +
      one('facebook', 'Facebook', 'f') + one('pinterest', 'Pinterest', '◉') + '</section>';
  }

  function renderVerifyStep(platform, info) {
    var box = document.getElementById(platform + 'VerifyStep');
    if (!box) return;
    var isCode = info.challenge === 'code';
    box.style.display = 'grid';
    box.innerHTML = '<p class="helper spy-verify-hint">⏳ ' + esc(info.challengeHint || 'تحقق مطلوب من المنصة.') +
      (info.expiresInSec ? ' <small>(مهلة ~' + Math.ceil(info.expiresInSec / 60) + ' د)</small>' : '') + '</p>' +
      (isCode
        ? '<input type="text" inputmode="numeric" id="' + platform + 'VerifyCode" placeholder="رمز التحقق" autocomplete="one-time-code">' +
          '<button type="button" class="small-button" id="' + platform + 'VerifyBtn">تأكيد رمز التحقق</button>'
        : '<button type="button" class="small-button" id="' + platform + 'VerifyBtn">وافقتُ من هاتفي — تحقق الآن</button>') +
      '<button type="button" class="small-button plain" id="' + platform + 'VerifyCancel">إلغاء المحاولة</button>';
    var btn = document.getElementById(platform + 'VerifyBtn');
    btn.onclick = function () {
      btn.disabled = true;
      btn.textContent = '…جارٍ التحقق';
      var codeInput = document.getElementById(platform + 'VerifyCode');
      fetch('/api/sessions/' + platform + '/verification', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ code: codeInput ? codeInput.value : '' }),
      })
        .then(function (r) { return r.json(); })
        .then(function (result) {
          if (!result.ok) throw new Error(result.message || 'فشل التحقق.');
          spyNotice('تم الاتصال بـ ' + platform + ' بنجاح ✓', 'good');
          refreshSessionsCard();
        })
        .catch(function (error) {
          spyNotice(error.message, 'bad');
          btn.disabled = false;
          btn.textContent = isCode ? 'تأكيد رمز التحقق' : 'وافقتُ من هاتفي — تحقق الآن';
        });
    };
    document.getElementById(platform + 'VerifyCancel').onclick = function () {
      fetch('/api/sessions/' + platform + '/verification', { method: 'DELETE' }).finally(function () {
        box.style.display = 'none';
        var form = document.getElementById(platform + 'SessionForm');
        if (form) form.style.display = 'grid';
      });
    };
  }

  function enterVerificationMode(platform, info) {
    var form = document.getElementById(platform + 'SessionForm');
    if (form) form.style.display = 'none';
    renderVerifyStep(platform, info);
  }

  function installSessionCard() {
    var settings = document.getElementById('screen-settings');
    if (!settings || document.getElementById('spySessionsCard')) return;
    var firstCard = settings.querySelector('.card');
    var holder = document.createElement('div');
    fetch('/api/sessions').then(function (r) { return r.json(); }).then(function (statuses) {
      holder.innerHTML = sessionCardHtml(statuses);
      if (firstCard) settings.insertBefore(holder.firstElementChild, firstCard.nextSibling);
      ['facebook', 'pinterest'].forEach(function (platform) {
        var loginBtn = document.getElementById(platform + 'LoginBtn');
        var logoutBtn = document.getElementById(platform + 'LogoutBtn');
        if (loginBtn) loginBtn.onclick = function () {
          loginBtn.disabled = true;
          loginBtn.textContent = '…جارٍ تسجيل الدخول (قد يستغرق دقيقة)';
          fetch('/api/sessions/' + platform + '/login', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              username: document.getElementById(platform + 'LoginUser').value.trim(),
              password: document.getElementById(platform + 'LoginPass').value,
            }),
          })
            .then(function (r) { return r.json(); })
            .then(function (result) {
              if (!result.ok) throw new Error(result.message || 'فشل تسجيل الدخول.');
              if (result.status === 'verification_required') {
                spyNotice('تحقق إضافي مطلوب من المنصة — أكمل الخطوة الظاهرة في البطاقة.', 'good');
                enterVerificationMode(platform, result);
                return;
              }
              spyNotice('تم الاتصال بـ ' + platform + ' بنجاح.', 'good');
              refreshSessionsCard();
            })
            .catch(function (error) { spyNotice(error.message, 'bad'); })
            .finally(function () {
              loginBtn.disabled = false;
              loginBtn.textContent = 'تسجيل الدخول عبر متصفح السيرفر';
            });
        };
        if (logoutBtn) logoutBtn.onclick = function () {
          fetch('/api/sessions/' + platform, { method: 'DELETE' })
            .then(function () { spyNotice('تم قطع اتصال ' + platform + '.', 'good'); })
            .finally(refreshSessionsCard);
        };
        var importBtn = document.getElementById(platform + 'ImportBtn');
        if (importBtn) importBtn.onclick = function () {
          var raw = (document.getElementById(platform + 'CookieImport') || {}).value || '';
          if (!raw.trim()) { spyNotice('الصق الكوكيز المصدرة من متصفحك أولاً.', 'bad'); return; }
          importBtn.disabled = true;
          importBtn.textContent = '…جارٍ الاستيراد والتحقق من الجلسة';
          fetch('/api/sessions/' + platform + '/cookies', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ cookies: raw }),
          })
            .then(function (r) { return r.json(); })
            .then(function (result) {
              if (!result.ok) throw new Error(result.message || 'فشل استيراد الكوكيز.');
              spyNotice('تم استيراد جلسة ' + platform + ' بنجاح ✓', 'good');
              refreshSessionsCard();
            })
            .catch(function (error) { spyNotice(error.message, 'bad'); })
            .finally(function () {
              importBtn.disabled = false;
              importBtn.textContent = 'استيراد الكوكيز والاتصال';
            });
        };
        var recheckBtn = document.getElementById(platform + 'RecheckBtn');
        if (recheckBtn) recheckBtn.onclick = function () {
          recheckBtn.disabled = true;
          recheckBtn.textContent = '…جارٍ الفحص';
          fetch('/api/sessions/' + platform + '/verify', { method: 'POST' })
            .then(function (r) { return r.json(); })
            .then(function (result) {
              if (!result.ok) throw new Error(result.message || 'تعذّر الفحص.');
              spyNotice(result.connected
                ? 'الاتصال بـ ' + platform + ' ساري ✓'
                : 'الجلسة غير مُسجَّلة الدخول فعلياً — اقطع الاتصال ثم سجّل الدخول مجدداً.',
                result.connected ? 'good' : 'bad');
              refreshSessionsCard();
            })
            .catch(function (error) { spyNotice(error.message, 'bad'); })
            .finally(function () {
              recheckBtn.disabled = false;
              recheckBtn.textContent = 'إعادة فحص الاتصال';
            });
        };
        // Resume an in-flight verification after page refresh
        fetch('/api/sessions/' + platform + '/verification')
          .then(function (r) { return r.json(); })
          .then(function (v) {
            if (v && v.ok && v.pending) {
              enterVerificationMode(platform, {
                challenge: v.challenge,
                expiresInSec: v.expiresInSec,
                challengeHint: platform === 'pinterest'
                  ? (v.challenge === 'code'
                    ? 'أدخل رمز التحقق الذي أرسله Pinterest إلى بريدك الإلكتروني أو تطبيق المصادقة في الحقل أدناه.'
                    : 'أكّد محاولة الدخول من بريدك أو تطبيق Pinterest، ثم اضغط زر التحقق.')
                  : (v.challenge === 'code'
                    ? 'أدخل رمز التحقق الذي وصلك (تطبيق المصادقة / SMS / بريد فيسبوك) في الحقل أدناه.'
                    : 'وافق على هذا الدخول من تطبيق فيسبوك على هاتفك، ثم اضغط زر التحقق.'),
              });
            }
          })
          .catch(function () { /* no pending challenge */ });
      });
    }).catch(function () { /* card stays hidden if API unreachable */ });
  }

  function refreshSessionsCard() {
    var old = document.getElementById('spySessionsCard');
    if (old) old.remove();
    installSessionCard();
    updateSocialHub();
  }

  function updateSocialHub() {
    var hub = document.getElementById('socialHubStatus');
    if (!hub) return;
    fetch('/api/sessions').then(function (r) { return r.json(); }).then(function (s) {
      hub.innerHTML = '<div class="spy-hub">' +
        '<span class="' + (s.facebook && s.facebook.connected ? 'on' : '') + '">Facebook: ' + (s.facebook && s.facebook.connected ? 'متصل ✓' : 'غير متصل') + '</span>' +
        '<span class="' + (s.pinterest && s.pinterest.connected ? 'on' : '') + '">Pinterest: ' + (s.pinterest && s.pinterest.connected ? 'متصل ✓' : 'غير متصل') + '</span>' +
        '<em>الماسح المدمج يعمل بلا API ولا رفع كوكيز — الاتصال اختياري ويعمّق النتائج.</em>' +
      '</div>';
    }).catch(function () {});
  }

  // ---- boot ---------------------------------------------------------------------
  function boot() {
    // The bridge script failed to load (usually: opened via ?token= deep link
    // before the cookie session existed, or an expired session). One clean
    // reload lands on the login form / fresh boot.
    if (!window.Native || typeof window.Native.openPinterestScanner !== 'function') {
      try {
        var reloads = Number(sessionStorage.getItem('orbitpress-bridge-reload') || '0');
        if (reloads < 1) {
          sessionStorage.setItem('orbitpress-bridge-reload', '1');
          location.replace('/');
          return;
        }
      } catch (e) { /* private mode — fall through */ }
      console.warn('[orbitpress] server bridge is missing; scans and saves need a signed-in session.');
    } else {
      try { sessionStorage.removeItem('orbitpress-bridge-reload'); } catch (e) { /* ignore */ }
    }
    installToolbar('facebook');
    installToolbar('pinterest');
    wrapCallbacks();
    installSessionCard();
    updateSocialHub();
  }

  if (document.readyState === 'complete' || document.readyState === 'interactive') boot();
  else document.addEventListener('DOMContentLoaded', boot);
})();

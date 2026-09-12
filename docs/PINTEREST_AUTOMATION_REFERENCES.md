# Pinterest automation references

- Pinterest Developer Guidelines: https://policy.pinterest.com/en/developer-guidelines
  Search finding: actions such as following/unfollowing must be selected by the end user; do not perform actions on behalf of users without their specific knowledge and consent.
- Pinterest API create boards and pins: https://developers.pinterest.com/docs/work-with-organic-content-and-users/create-boards-and-pins/
  Search finding: official API supports creating/managing boards and Pins for authenticated users.
- Pinterest API create pin: https://developers.pinterest.com/docs/api/v5/pins-create/
  Search finding: official create-Pin endpoint is available; it does not by itself establish a generic bulk auto-repin/follow workflow.
- Pinterest Buttons / Save: https://developers.pinterest.com/docs/web-features/buttons/
  Search finding: official Save button links to an existing Pin rather than creating a new Pin.

These references were checked while designing PinFlux 2 features and should be revalidated before adding external actions that may depend on changing Pinterest permissions or terms.

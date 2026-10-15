# Web / Android / guest capability evidence

Snapshot: 8 October 2026. “Implemented” describes source, not a complete release gate. Android device acceptance is pending for every native feature. Guest identities are not yet implemented.

| Capability | Web | Android | Guest | Permission / acceptance evidence |
| --- | --- | --- | --- | --- |
| Member token sessions | Implemented | Initial client + SecureStore | Pending | Local API role/revoke/expiry tests; mobile transport/type/bundle checks; device storage pending |
| Google linking/login | Explicit proof-backed link | Pending | Pending | Real-SDK synthetic API tests; live provider pending |
| Today | Implemented | Task/meet reads, counts | Pending | Scoped local API journeys; ten web component browser checks; Android device pending |
| Owned task completion | Implemented | Implemented | Pending | Current project/assignee API tests and web keyboard interaction; mobile request contract checked |
| Task schedules/boards/comments | Schedule/owner editing and history implemented; boards/comments pending | Pending | Pending | No acceptance evidence |
| Project/department workspace | Existing partial capabilities | Pending detailed screens | Pending | Project read negative API tests; broader workspace acceptance pending |
| People/profile/roles | Existing administration and sessions | Sign-in identity + device session controls | Pending | Custom auth/role API tests; full native screens pending |
| Team instances | Existing | Pending | Pending | Advisory denial baseline; broader nested tests pending |
| Meetings | Existing scheduling | Upcoming list + HTTPS join | Pending | Queue department/board scope tested; native lifecycle pending |
| Files | Shared library implemented; contextual ownership pending | Pending | Pending | Real local R2 namespace/role negative tests; native pick/download/share pending |
| Announcements | Existing | Pending | Pending | Native/read/acknowledgement extension acceptance pending |
| Newsletter/Send Mail | Existing web pipeline | Pending | Pending | Quota/queue/retry and native parity acceptance pending |
| Letter Studio | Existing web/editor boundary | Pending | Pending | Shared library exclusion verified; native template/PDF/send acceptance pending |
| Chat/activity/push | Pending | Pending | Pending | No implementation acceptance yet |
| Approvals/invitations | Existing web actions | Counts only | Pending | Queue counts scoped; native action/review screens pending |

No website link, read-only count, JavaScript export or missing screen is counted as native outcome parity. Expand evidence row by row during implementation; full platform completion requires the charter's remaining capabilities, operational checks and personal-account deployment.

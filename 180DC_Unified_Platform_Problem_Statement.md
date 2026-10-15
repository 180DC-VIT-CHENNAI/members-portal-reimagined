---
title: "180DC Unified Operations Platform"
subtitle: "Website Modernisation + Android Application | Product Problem Statement and Feature Charter"
author: "180 Degrees Consulting, VIT Chennai"
date: "8 October 2026"
lang: en-GB
keywords: [180DC, website, Android, operations, consulting, product problem statement]
---

> **Document status:** Product proposal for discussion and engineering scoping. No new feature, platform migration, external-access policy, budget, or deadline in this document is approved merely by appearing here.
>
> **Primary purpose:** Define the problems to solve, the experiences to deliver, the rules that must hold, and the evidence needed for acceptance. This is **not** an instruction to rewrite the existing system, pick a hosting provider, or implement every feature at once. Engineering owns solution design within the accepted product and security constraints.

# Executive brief

## The problem statement

**180DC VIT Chennai needs one dependable operating environment in which club members, department leads, the board, and authorised external collaborators can find work, complete work, communicate, and preserve institutional knowledge without relying on disconnected messages, files, or unofficial processes.** The existing website provides a substantial foundation, but a website-only, administration-centred experience is not the same as a coherent day-to-day workspace. The product should improve the current portal, protect what already works, and extend the same source of truth to an Android application.

**Design challenge:** How might 180DC evolve its existing website into an intuitive, accountable club-and-consulting operations platform, while adding a mobile app that makes relevant work available anywhere and introduces secure, contextual collaboration with invited clients?

The proposed result is **one product spanning two interfaces**, not a website and an app that independently maintain members, projects, permissions, documents, or conversations. The website remains the comprehensive administrative and public-facing surface; Android becomes a first-class, mobile-appropriate interface for members and authorised guests.

## Product promise

- A member can understand *what needs attention today* without searching several pages or message threads.
- A director can coordinate a project, people, deadlines, meetings, files, and client discussion from one contextual workspace.
- A board member can manage approvals, access, club records, letters, outreach, and operational risk with a clear audit trail.
- An invited client can participate in precisely the engagements and conversations shared with them, without obtaining internal club visibility.
- A new committee can operate and maintain the platform after annual handover without depending on the previous technical team's personal accounts or undocumented decisions.

## What successful delivery means

The programme succeeds when existing functionality continues to work, high-frequency user journeys become easier, the website and Android app show consistent records, access boundaries withstand deliberate abuse tests, and the club can maintain the system between academic years. A polished launch screen is not a substitute for those outcomes.

## Decision at the outset

Approve **discovery and a bounded pilot**, rather than pre-approving the entire feature catalogue. Appoint a product owner and technical owner; confirm whether client access is in scope; agree on the initial user groups; and define privacy, retention, and approval policies before sensitive workflows go live.

# 1. Evidence, scope, and interpretation

## 1.1 Existing baseline, not a blank project

The starting point is the existing `180DC-VIT-CHENNAI/180dc-admin-website` repository and the uploaded *180DC VIT Chennai Android App: Product Proposal and Implementation Roadmap*, dated 8 October 2026. The uploaded proposal cites a `main` snapshot at `f9c44a27ab4fd07b0899440e0d6a50fd8e366ada`. Repository product and current-state documents were also consulted on 8 October 2026; those documents describe the codebase but are **not** a new line-by-line production audit.

The repository describes a Vite/React/TypeScript website and a Hono API on Cloudflare Workers. Club records are in D1; newsletter records use a separate D1 database; uploaded assets use R2. Authentication includes member tokens and linked Google/Clerk sign-in. The current-state documentation describes Spacemail SMTP as the main email route with a Resend fallback, with queued bulk sends and scheduled draining. The public newsletter archive is associated with a separate website.

The baseline covers public-facing information, subscriptions, consulting/account requests, members, roles, departments, role transfers, projects, tasks, team instances, meetings, files, case studies, announcements, newsletter tools, and maintenance controls. The supplied Android proposal additionally inventories Send Mail and a 13-template Letter Studio; those workflows must be verified in the actual running portal before promising exact mobile parity.

**Not established as existing:** real-time member/client chat, an Android application, authenticated guest workspaces, mobile push notifications, an AI assistant, or a complete external client portal. Repository documentation marks `public-api` and `job-processor` as placeholders. Historical documents must not be treated as proof of working features.

## 1.2 Status labels used in this document

| Status | Meaning |
|:---|:---|
| **B - Baseline** | Already described as implemented in the source proposal or current repository documentation; reverify behaviour before modifying. |
| **E - Enhancement** | Improvement to a baseline feature, proposed but not yet accepted or built. |
| **N - New** | New product capability to design and implement if approved. |
| **O - Optional** | Candidate for later assessment, not part of the committed pilot. |
| **D - Decision** | Requires policy or owner approval before engineering can define correct behaviour. |

Requirements written as **must** are intended acceptance conditions *if the relevant feature is selected for release*. They are not a statement that the feature already exists. Illustrative UX patterns and implementation choices are suggestions, not binding architecture.

## 1.3 Scope boundary

**In scope for product discovery:** modernising the internal website; rationalising workflows and navigation; reviewing existing module quality; introducing a mobile app; synchronising data and permissions; adding contextual communication, activity/notifications, explicit guest access, auditability, and handover readiness.

**Not automatically in scope:** replacing the technology stack, rebuilding the public site from scratch, a separate recruitment system, mass migration to a new email provider, a full enterprise CRM/ERP, public social networking, voice/video conferencing, payments, unrestricted AI autonomy, or publishing private club information. Each needs a separate product decision.

# 2. Problems to investigate

The following are **hypotheses**, not findings from measured user research. Discovery must confirm or reject them.

| ID | Observed product opportunity / hypothesis | What to validate |
|:---|:---|:---|
| P-01 | Members may struggle to distinguish urgent tasks from general portal information. | Task-discovery time and missed updates. |
| P-02 | Department and project context may be fragmented across records, files, and external chats. | Where decisions and files are actually exchanged. |
| P-03 | Board-only workflows may lack a single reviewable queue. | Approval volumes and present routing. |
| P-04 | Website screens designed for desktop may make quick mobile actions inconvenient. | Mobile task-completion observations. |
| P-05 | Client communication can become hard to preserve across team changes. | Client expectations, confidentiality needs. |
| P-06 | Annual club turnover can lose decisions, ownership, and operating knowledge. | Handover incidents and information gaps. |
| P-07 | Sending newsletters and official communications carries avoidable operational risk without clear preview, consent, pacing, and status. | Real sender/provider limits and errors. |
| P-08 | Authorisation may become inconsistent as new roles, guests, files, and mobile clients are added. | Existing policy matrix and negative tests. |

**Discovery outputs:** a walkthrough of real workflows; 5-10 member/lead/board interviews; a small number of external-collaborator interviews if guest access is pursued; API and permission inventory; baseline usability timings; information-sensitivity map; and an agreed first-pilot scope.

# 3. Users and the access model

## 3.1 Personas and jobs

**General member.** Find assigned work, project context, relevant meetings, department announcements, approved files, and people. Update work without navigating the complete administration system.

**Director / department lead.** Assign work, track project and team progress, manage department material, schedule meetings, escalate blockers, and maintain a reliable record of decisions.

**Board / authorised operations owner.** Manage membership, roles, consulting requests, approval queues, publication, mail campaigns, templates, access disputes, and audits. Board access remains subject to privacy rules; rank alone must not silently expose all private messages.

**Advisory member.** Access only the records and collaboration surfaces authorised by advisory policy; existing exclusions, including team-instance access, remain until explicitly revised.

**Newsletter/letter editor.** Prepare, review, preview, and send or issue only content covered by the editor's authorisation, without obtaining broad administrative permissions.

**Invited client or external collaborator.** Verify identity, open a limited engagement workspace, review explicitly shared milestones or deliverables, and message assigned club contacts. They must not be able to enumerate internal members or unrelated work.

**Public visitor or subscriber.** Read public information, inspect approved case studies/projects, request consulting services, opt into communication, and withdraw that consent.

## 3.2 Access principles

1. **Deny by default.** A person sees only resources covered by a current, explicit policy.
2. **Roles are not the whole policy.** Resource membership and sensitivity matter alongside role or power level.
3. **Server enforcement.** A hidden UI element never substitutes for backend authorisation.
4. **Lifecycle enforcement.** Role transfer, removal, resignation, expired invitation, or project closure must affect access promptly, including active chat sessions and attachments.
5. **Data segregation.** Public, internal, sensitive-board, and guest-shared content must have clear boundaries.
6. **Auditable critical actions.** Record who approved, changed, sent, issued, shared, revoked, exported, or deleted consequential data.
7. **Privacy of direct messages.** Elevated administrators do not automatically get blanket visibility into private conversations; a defined reporting/moderation procedure is required.

# 4. The unified product model

The platform should present related information together while keeping authoritative ownership clear.

**Organisation** contains people, roles, departments, policies, and current leadership. **Engagements/projects** connect a request or organisation to a scope, people, work, milestones, meetings, files, decisions, and optionally a client. **Conversations** occur within explicitly authorised direct, department, team, or engagement contexts. **Communications** include announcements, emails, newsletter issues, and official letters with clear send/issue histories. **Activity** records meaningful changes and notifications, not necessarily the full contents of sensitive resources.

A user may reach the same project from the dashboard, department, task list, meeting, or chat. Those are views into **one record**. A mobile edit and a web edit must not create competing versions of the project.

**Core product invariants:**

- One authoritative identity and membership policy across supported interfaces.
- One authoritative record per project, task, meeting, request, file, invitation, and communication event.
- A change becomes visible to authorised users in a defined, testable interval; stale data is labelled.
- No guest can obtain internal access through search, direct links, shared IDs, notifications, attachment URLs, or cached app data.
- Critical mutations are either confirmed as persisted or clearly shown as pending/failed; no silent false success.
- The site continues to operate through incremental migration, including during staged mobile rollout.

# 5. Website modernisation: the operational experience

## 5.1 Home and role-aware work queue [E]

Replace the idea of a generic overview with a useful **Today / Needs attention / Recent activity** experience. Members should see tasks due soon, relevant meetings, mention or invitation alerts, unread project updates, and practical shortcuts. Directors should additionally see approvals and blocked work for their departments. The board should see club-wide items requiring action, with sensitive metrics kept in authorised views.

Users must be able to filter by department/project/time, navigate from an alert to the underlying object, and distinguish tasks assigned to them from tasks they merely follow. Counts must have defined meanings: for example, "overdue" means open and past its due date, not simply past a scheduled meeting.

**Acceptance example:** after a director changes a task owner and due date, the previous owner stops seeing it as assigned, the new owner sees it, and both interfaces point to the same task record.

## 5.2 Navigation, search, and usability [E]

Create consistent primary navigation around **Home, Work, People, Communications, Resources, Administration**. Show only permitted destinations without assuming that this hides forbidden API operations. Offer search with scoped results, clear empty states, breadcrumbs on desktop, deep links, keyboard access, reusable forms, autosaved drafts where safe, and plain-language validation errors. Support phone-size web access even though a native app is planned.

Any destructive action requires a review step proportional to its risk. Long forms should save recoverable drafts or warn before exit. Existing users must still find old capabilities during the transition through redirects, in-product pointers, or a short help index.

## 5.3 Member lifecycle and directory [B+E]

Preserve directory, account requests, token handling, profiles, roles, department assignment, and role transfers. Improve them with a clear onboarding checklist, account state, role/department history, current responsibilities, exit/deactivation process, and a standard handover checklist. Suggested optional profile fields include working preferences, skills, and availability; these require voluntary disclosure and agreed visibility rules.

The system should allow a board operator to view pending account requests in one queue, identify duplicates, record approval/rejection reasons, and safely revoke or suspend access. Role transfers must continue following their existing acceptance rules unless a new policy is approved. Avoid exposing raw long-lived tokens in ordinary interfaces wherever a safer session model is feasible.

## 5.4 Departments and operating workspaces [B+E]

Every department needs a home for its roster, lead, responsibilities, meetings, working documents, announcements, active projects, action items, and handover notes. Leads should edit their own department within current policy; board staff may have broader operational control without bypassing sensitive content restrictions.

An optional cross-department workspace can connect shared projects, ownership, requests, and decisions. Movement of a member between departments must recalculate access to old and new resources, not merely change the displayed label.

## 5.5 Projects and consulting engagements [B+E+N]

Preserve existing global projects, company metadata, department assignments, deadlines, project roles, completion status, and task management. Expand the experience from a static record into an **engagement workspace**:

- A project summary: purpose, client/partner, status, dates, current owner, teams, and authorised stakeholders.
- A scope section: agreed problem, expected outputs, assumptions, exclusions, and changes in scope.
- Milestones, deliverables, owners, review state, due dates, and blockers.
- A contextual timeline linking tasks, meetings, decisions, files, and client-visible updates.
- A handover and closure checklist so work is not lost when student teams rotate.
- An explicit **internal vs client-shareable** boundary on each item. Sharing a project must never automatically share all its contents.

Suggested lifecycle: **proposed -> triage -> accepted -> planning -> active -> review -> completed -> archived**, with configurable exception states. This is a proposed workflow, not a claim about the current database or a requirement to replace current status fields immediately.

**Acceptance example:** a lead can close a project only after responding to unresolved work or recording an exception. An authorised client sees the final shared deliverable, but cannot open internal performance notes attached to the same engagement.

## 5.6 Tasks, milestones, and accountability [B+E]

Provide list and board views, owner, due date, priority, short description, checklists, comments, supporting files, dependencies, status, and activity history. Bulk operations may be available to authorised leads. Users should filter by assignee, project, department, due window, or blocked state. Reassignments and deletions must be attributable.

A task is never "completed" because a notification was delivered. Reopening should preserve history. Dependencies and recurring tasks are optional until demonstrated useful; do not overload the pilot with project-management mechanics that nobody uses.

## 5.7 Team instances and event coordination [B+E]

Preserve current instance/team concepts, including teams, internal and external participant records, limits/minimums, and progression where available. Improve organiser ergonomics through clear roster validation, assignment changes, eligibility notes, phase/state tracking, participant communication, and export controlled by role. External participant records **must not** turn into authenticated guest accounts without explicit invitation and identity verification.

Any automated scoring, ranking, or selection rule requires a separately approved specification. Audit manual overrides if such rules are introduced.

## 5.8 Meetings and decisions [B+E]

Keep club, departmental, and inter-department meeting creation, links, and relevant notifications. Add response tracking (where useful), a meeting agenda, attendance or acknowledgement, minutes, decisions, action owners, and follow-up reminders. A meeting record should keep its useful context after a meeting link stops being shown under the existing time-based rule.

**Acceptance example:** a minute item marked "action required" can become a task linked to the meeting, with a named owner and due date. A user without permission to view the meeting cannot retrieve its private notes through the task link.

## 5.9 File and knowledge workspace [B+E]

Preserve categories and approved uploads/downloads. Add contextual attachments to projects, departments, tasks, and meetings, with human-readable names, previews where safe, revision information, owners, search, and archived state. Define permitted file formats and size limits, malware/abuse handling as appropriate, and documented delete/recovery rules.

**File permission follows the owning resource.** A shared client document cannot expose another file just because both are stored in the same bucket or share a predictable path. Public assets and private engagement material require different exposure rules. Avoid turning a browser-local document log into a supposed club-wide archive.

## 5.10 Announcements and action-oriented notices [B+E]

Keep role-restricted publication and deletion. Add audiences (club, department, project), scheduled posting where approved, acknowledgement for critical policy notices, pinned/expiring notices, and links to related work. People should not receive multiple indistinguishable alerts about the same event.

Announcements are not a substitute for transactional email in safety-critical or formal notices; the owner chooses the required channel and confirmation behaviour.

## 5.11 Consulting intake and partner/client relationship [B+E+N]

Preserve public consulting requests and board accept/reject responses. Add an internal triage view with assigned owner, request category, follow-up due date, decision reason, contact history, and conversion to a project when accepted. Potential partners should have a distinct relationship record only when needed for club operations. Do not describe the product as a commercial CRM unless the club agrees to manage that data.

An approved engagement may gain a client workspace by invitation. The client can view shared milestones or deliverables and communicate with assigned club contacts. It must not inherit access to member rosters, internal discussions, financial material, or unrelated work.

## 5.12 Newsletter, Send Mail, and communication operations [B+E]

Preserve the separate newsletter archive, subscribers, authorised editors, draft/source management, event/newsletter composition, and the existing sending pipeline. Improving the product **does not require replacing Spacemail**. The sending UI should offer a clear campaign review: audience definition, recipient estimate, consent status, subject/sender, HTML preview, attachment check, test send, scheduling/pacing, and final authorised confirmation.

Operational status should distinguish **draft, queued, processing, accepted by provider, failed, and cancelled**; a successful queue insert must not be reported as successful delivery to every inbox. The current SMTP route and fallback should be measured before changing it. Respect provider limits, bounce/retry policies, unsubscribe controls, suppression handling, and transactional versus marketing purpose. Every send should have an idempotent campaign identifier to avoid double campaigns after page refreshes or retries.

**Acceptance example:** an editor attempts to resend a campaign after a timeout. The system shows the existing campaign record and does not duplicate the recipient batch unless an authorised operator explicitly starts a new send.

## 5.13 Official Letter Studio [Proposal baseline; verify + E]

The uploaded mobile proposal includes these 13 document types: appointment, promotion, termination, department transfer, resignation, show-cause/warning, service certificate, relieving letter, recognition letter, MOU, announcement letter, department report, and LDI form.

The modernised experience should preserve authorised form inputs, editable preview, correct letterhead, signatures, pagination, generation, PDF export, and authorised email delivery. Propose template versioning, approval status, document numbering if the club wants it, issue timestamps, revocation/correction process, and an audit history. Any formally issued letter should be distinguishable from an unapproved draft.

**Critical caveat:** a browser-local history is not a shared records archive. Engineering must validate the actual existing PDF flow and identify which document classes, if any, require durable central storage or retention under club policy.

## 5.14 Public website and published work [B+E]

Keep the public site as the club's main entry point: about, leadership, chapter identity, case studies, completed projects, partner information, consulting request, account request, and newsletter pathways. Improve reading performance, clarity of calls to action, accessible navigation, mobile responsiveness, public SEO metadata, and correction workflows. Public case studies should be approved and scrubbed of confidential client details before publication.

A simple **internal draft -> review -> approved for publication** process is proposed for public-facing project outcomes. Do not expose completed-project metadata automatically if it was never explicitly approved for public use.

## 5.15 Administration, oversight, and continuity [B+E+N]

Unify account requests, role changes, consulting triage, publication reviews, newsletter sends, document approvals, and guest invitations in permission-scoped queues. Expose relevant audit history, stale or failed jobs, maintenance status, system notices, and backup/recovery ownership to authorised operators. A non-technical board member should be able to tell whether an action actually happened and who can resolve a failure.

A configurable approval engine is optional. The initial release can use simple explicit approval flows. Avoid making every ordinary edit pass through the board.

# 6. The Android application: a first-class companion

## 6.1 Positioning [N]

The Android application is an authenticated **companion to the same platform**, not a compressed screenshot of the website. It should make common actions quick, keep users connected to the work they own, respect unreliable mobile connectivity, and provide useful notifications. It is not necessary to recreate decorative public-site interactions in native form.

The proposed first-level navigation is **Home, Work, Chat, Resources, More**. "More" contains profile, meetings, notices, and authorised administrative/editor tools. External guests receive a separate minimal experience with their permitted engagement, conversation, shared resources, and profile. These names are candidates for usability testing, not mandatory route names.

## 6.2 Essential mobile journeys [N]

1. **Open the app -> see priorities -> act.** A member sees tasks, deadlines, relevant meetings, notices, and recent changes. A task update takes a small number of deliberate taps, with a clear success result.
2. **Open a project -> review context -> coordinate.** A lead moves among milestones, teammates, shared files, meeting decisions, and the correct conversation without losing the project context.
3. **Get notified -> open an authorised destination.** A notification links to the right resource and rechecks permissions when opened. Revoked or deleted resources fail safely.
4. **Approve/reject on the move.** An authorised director or board member reviews the relevant request, sees the consequences, and confirms a decision.
5. **Join as invited client.** An invited collaborator verifies the intended identity and sees only their specific conversation, engagement information, and files.
6. **Resume after poor network.** The app shows whether a write is pending, accepted, or failed; it can refresh missed messages without silently dropping or duplicating them.

## 6.3 Capability parity without identical screens

The longer-term objective is equivalent **outcomes**, not identical desktop interactions. Complex team boards, rich text editing, and official document templates may need a mobile-specific UI or an authenticated embedded editor if validated. The engineering team must produce a per-capability matrix: *web supported / mobile supported / guest supported / permission tested / acceptance evidence*. A temporary link to the website must be labelled as such; it does not silently count as native mobile parity.

| Capability family | Web ambition | Android ambition |
|:---|:---|:---|
| Daily work | Full dashboards and queues | Quick priorities, task actions, alerts |
| People and roles | Complete administration | Directory, profile, allowed approvals |
| Projects/departments | Full editing and management | Contextual read/edit, mobile-friendly forms |
| Team instances | Rich organiser controls | Roster/phase views and safe edits |
| Meetings | Scheduling and records | Agenda, links, attendance, actions |
| Files/knowledge | Browse, upload, manage, review | Device pick/upload, download, preview |
| Announcements | Authoring, review, audience | Read, acknowledge, allowed authoring |
| Newsletter/letters | Full editor with controls | Approve, preview, issue/send where feasible |
| Communication | New contextual chat and activity | Real-time chat, push, deep links |
| Guests | Invitation and scope administration | Restricted client workspace |

## 6.4 Mobile-specific expectations

The app should support device-secure sessions, logout and remote revocation, accessible touch controls, text-size scaling, dark and light themes, file sharing through platform mechanisms, and Android notification permissions/channels. A read-only cache for recently viewed permitted content is useful; stale information must have a visible freshness indicator. Offline editing of critical administrative data is **not** an initial requirement. Chat drafts and attempted sends may be retried with explicit state.

Sensitive material must not remain available indefinitely after sign-out, guest revocation, or device compromise. Push messages should reveal little by default for client discussions, and users should be able to mute appropriate categories.

**Platform choice is not settled by this document.** The supplied proposal recommends React Native with TypeScript because the team already uses React/TypeScript, and it mentions Capacitor and Kotlin as alternatives. Engineering should validate skills, authentication, PDF editing, lifecycle support, and maintenance cost before committing. Future iOS is a separate decision.

# 7. Collaboration and chat: a new subsystem

## 7.1 Why contextual conversation matters [N]

A project message becomes more useful when its audience and associated engagement are clear. The goal is to make communication discoverable for current authorised participants and durable through a handover, without turning private messages into an unrestricted organisational database. Real-time chat is **not implemented in the inspected baseline**.

## 7.2 Conversation types

| Type | Membership principle | Appropriate content |
|:---|:---|:---|
| Direct member chat | Explicit eligible participants | One-to-one coordination |
| Department room | Department membership + approved oversight | Department operations |
| Project/team room | Assigned membership or explicit invitation | Work and delivery coordination |
| Client room | Named invited guests + assigned 180DC contacts | Client-approved collaboration |
| Announcement discussion (optional) | Explicit audience and moderators | Structured discussion of notices |

Department membership does not imply visibility into an unrelated client room. Joining or leaving a project does not automatically grant access to past restricted messages unless retention and historical-access policy allow it. Guest-to-member direct messages should be limited to assigned contacts.

## 7.3 Minimum useful chat [N]

Support text, safe attachments, chronological stored history, paginated loading, reply references, unread counts, per-room mute, member/guest management by authorised owners, reporting, and clear pending/sent/failed states. Delivery acknowledgement must mean that the message is durably accepted by the service, **not** read by its recipient. Reconnecting retrieves missed items without relying on a push message having arrived.

Later candidates include search, reactions, mentions, threads, rich editing, and typing indicators. Voice/video and end-to-end encryption are **not** promised by the initial scope. Ordinary encrypted transport must not be marketed as end-to-end encryption.

## 7.4 Guest onboarding and expiry [N+D]

An authorised engagement owner invites a specific email address to named resources and rooms. The invitation expires and can be revoked. The invited person verifies the email, accepts the applicable policies, and obtains a scoped identity. Changing the email, forwarding the invite, or guessing a resource identifier must not allow an unauthorised party to gain access.

Project closure may remove access immediately or after a defined grace period; the board must select the policy. Guest users should know what material they can see, who their 180DC contacts are, and when access ends. External participants listed in team events are not automatically guest identities.

## 7.5 Chat safety, moderation, and recoverability [N+D]

- Authorisation is enforced on room join, message send, history fetch, attachment download, and membership change.
- A blocked or removed participant loses access to active connections promptly.
- Message order and deduplication are well defined for retries across devices.
- Reports route to appointed moderators; access to reported material is narrow and auditable.
- Deletion, retention, export, and legal/privacy requirements need explicit policies.
- File attachments obey malware/size/type constraints and the owning conversation's permissions.
- Notification text cannot leak message contents after role or guest revocation.
- Club moderation should not provide blanket surveillance over private direct messages.

# 8. Cross-product workflows that must feel connected

## 8.1 New member onboarding

**Trigger:** a member account request is approved. **Experience:** the member receives authorised onboarding instructions, signs in, sees current role/department, completes profile essentials, reads required notices, and finds first tasks/meetings. **Exit:** the board can see what remains incomplete without viewing unnecessary personal information.

## 8.2 Consulting engagement from enquiry to case study

**Trigger:** an organisation submits a consulting request. **Experience:** a board owner triages it, accepts or rejects with an accountable reason, converts accepted work into an engagement, assigns a lead/team, tracks scope and deliverables, optionally invites a client, records sign-off, closes the work, and submits any public case study for separate approval. **Exit:** internal closure does not imply approval to publicise client information.

## 8.3 Event organisation with teams

**Trigger:** an organiser creates a team instance. **Experience:** eligible participants are listed, team size rules are validated, authorised leads manage teams and phases, meetings and announcements remain attached to the instance, and changes can be traced. **Exit:** external participant data does not grant general portal access.

## 8.4 Newsletter publishing

**Trigger:** an editor prepares an issue. **Experience:** create a draft, validate recipients/consent, preview on desktop and mobile, perform a test send, request approval if policy requires, queue the campaign, observe processing/provider state, and inspect failures. **Exit:** a message is never labelled as delivered solely because it was queued or accepted for transport. Public newsletter pages only publish appropriate issues.

## 8.5 Role transition and annual handover

**Trigger:** a director rotates or a member leaves. **Experience:** review current ownership of projects, tasks, documents, conversations, app sessions, integration accounts, and pending approvals; transfer or revoke each appropriately; record decisions; and validate the successor's access. **Exit:** access tied to the old role is removed without deleting the club's legitimate institutional record.

# 9. Non-functional requirements and trust boundaries

## 9.1 Reliability and consistency

An action must clearly state whether it succeeded. Queued work must be identifiable, idempotent where appropriate, retryable under defined limits, and visible to operators when stuck. Network retries must not duplicate email campaigns, chat messages, letters, or invitations. Data-changing operations should be designed to survive browser reloads, intermittent connections, and deployment changes.

The website and app should agree on authorised data and state; specify acceptable sync delay per workflow during discovery. A cached mobile view may display older non-sensitive records but must not permit stale privileges to authorise new requests.

## 9.2 Accessibility and usability

Target meaningful accessibility for keyboard users, screen readers, contrast, readable typography, responsive layouts, large text, sufficient touch targets, and semantic form errors. Use WCAG 2.2 AA as a useful review target for website journeys, adapted to mobile-platform accessibility standards. Test with real users rather than asserting compliance from a component library.

## 9.3 Security and privacy

Apply least privilege, meaningful session expiry and revocation, secure credential handling, no sensitive tokens in logs, protection against cross-site and mobile API abuse, strict server-side resource checking, secure file delivery, and content sanitisation. Restrict export, bulk email, role changes, private documents, and guest sharing more strongly than ordinary viewing.

Define classification such as **public / internal / restricted / client-shared**. Privacy and retention rules must cover member records, application analytics, messages, client data, attachments, letters, and email-subscription records. Document consent and unsubscribe handling. Design incident response for accidental client exposure and device loss.

## 9.4 Audit, operations, and recovery

Record who changed role membership, changed guest access, approved a request, issued a letter, started a campaign, or deleted a critical resource. Logs must be accessible only to authorised maintainers and omit credentials and private message content unless required for a narrowly approved moderation event. Monitoring should expose errors, provider failures, queue delay, chat availability, unexpected cost growth, and suspicious access patterns.

Have tested backup/restore, rollback, incident contacts, release ownership, signing key custody, environment inventory, migration process, and a successor-readable operational guide. Club-controlled accounts and shared recovery procedures are mandatory before a public mobile release.

## 9.5 Performance and affordability

Set performance and operating-cost targets after measuring actual traffic and device capability. Start with practical categories: dashboard start/load, search response, API availability, notification freshness, chat acknowledgement, successful file transfer, crash-free mobile sessions, email queue progress, and monthly spend.

The product must not assume that adding chat, file uploads, email fallbacks, or push infrastructure is free merely because the club already runs Cloudflare services. Budget for storage, sends, retention, observability, backup, and app distribution using measured or forecast usage. Define owner-approved spend ceilings and alerts before scale-out.

# 10. Engineering freedom and compatibility contract

This document deliberately **does not choose** database schema, framework, monorepo layout, CDN, cloud deployment, RPC/REST pattern, event bus, chat transport, or Android stack on behalf of the engineering team. The existing Cloudflare/React system is a practical baseline and a reason to prefer evolution over replacement, not a permanent technology mandate.

The uploaded Android proposal sketches React Native/TypeScript, the existing Cloudflare backend, Durable Objects for WebSockets, and Firebase Cloud Messaging. These are **candidate designs**, not accepted requirements. Alternatives are valid if they meet the same security, delivery, operational, budget, and interoperability constraints.

Engineering must first inspect the real code/API, document the actual access matrix, validate email and PDF behaviour, and identify migration hazards. Requirements should be translated into contracts, designs, and test plans only after discovery. Existing data must not be silently dropped or reset. Keep old website flows working while shared services evolve; introduce explicit migrations, deployment rollback plans, and regression checks.

Minimum architecture review questions:

1. Which existing modules can safely be reused as-is, and which are high-risk single-file or undocumented areas?
2. How will identities, mobile sessions, external guest identities, and role changes be reconciled securely?
3. What is authoritative for project membership, room membership, and attachment access?
4. How are chat ordering, retries, disconnects, and retention guaranteed?
5. How will Spacemail pacing, provider fallback, suppression and campaign deduplication work without overstating delivery?
6. How will letters and PDFs preserve official visual output on Android and web?
7. How are D1/newsletter data, file metadata, and conversation history backed up and restored?
8. Which parts of the system remain maintainable after the next student-team handover?

# 11. Delivery model and priorities

The aim is to ship a useful slice and gather evidence, not produce a giant one-time release. Timeline and staffing estimates require discovery.

| Stage | Product objective | Evidence to exit |
|:---|:---|:---|
| **0. Discover** | Map real workflows, permissions, email/PDF behaviour, and risk. | Approved scope, policy decisions, user journeys, baseline metrics. |
| **1. Stabilise website** | Improve navigation, test critical flows, create shared work queues and reliable states. | Current workflows pass regressions; users can complete priority actions. |
| **2. Mobile core pilot** | Secure sign-in, home, tasks, projects, meetings, files, announcements, profile. | Small multi-role pilot completes scenarios, with no access leaks. |
| **3. Collaboration pilot** | Contextual rooms, secure guest invitation, attachments, notifications. | Reconnect, deduplication, revocation, reporting tests pass. |
| **4. Advanced parity** | Teams, approvals, outreach, newsletter tools, letters, publication flows as accepted. | Per-feature parity matrix and visual/PDF review pass. |
| **5. Harden and hand over** | Recovery, monitoring, usability, accessibility, release and annual ownership. | Tested rollback/restore, club-owned credentials, signed acceptance. |

These stages are dependencies, not calendar commitments. Website improvements and mobile foundations may be developed in parallel where they do not destabilise the same backend.

## 11.1 Prioritisation rules

**P0: Trust and continuity.** Identity and access correctness; existing site regressions; data integrity; safe file/message access; explicit error states; backups; operator ownership.

**P1: Highest-frequency work.** Role-aware home; project/task/meeting/dept experience; mobile core; activity updates; scoped invitations; reliable basic chat if approved.

**P2: Advanced operations.** Richer project lifecycle, approvals, knowledge discovery, deeper team administration, letter/mobile editor refinements, newsletter analytics and workflows.

**P3: Experiments.** Automated suggestions, sophisticated analytics, rich chat extras, integration expansion, iOS, and workflow automation. A later phase is not permission to weaken P0 requirements.

# 12. Acceptance criteria and measurable outcomes

## 12.1 Release-gating tests

| ID | Acceptance criterion |
|:---|:---|
| AC-01 | Every selected feature is mapped to a named role, test journey, and owning interface. |
| AC-02 | Existing login, member, project, department, file, meeting, newsletter and administration flows continue to work after backend changes. |
| AC-03 | A permitted web edit appears on Android and a permitted app edit appears on the website without creating duplicate authoritative records. |
| AC-04 | A guest cannot access an unrelated project, member directory, private file, room, or notification through either UI or direct API calls. |
| AC-05 | Removing a role, project member, session, or guest invitation invalidates new operations and active access as specified by policy. |
| AC-06 | Chat supports stored message history, reconnect/catch-up, ordered identifiers, idempotent retry, and correct failure states. |
| AC-07 | Private file downloads and previews enforce current authorisation, including after a link is shared. |
| AC-08 | A newsletter campaign cannot be started twice by accidental retry; queue, provider acceptance, and failure are shown distinctly. |
| AC-09 | Selected Letter Studio templates render accurate PDF output, with correct signatory/letterhead treatment, on their supported interfaces. |
| AC-10 | The website and app support usable empty/loading/error states and accessible primary flows. |
| AC-11 | Backups restore usable records; a failed release can be rolled back under a documented process. |
| AC-12 | A successor maintainer can deploy, diagnose a failed send, revoke access, and find technical/product ownership without consulting the original developer. |

## 12.2 Discovery and pilot metrics (targets, not measurements)

For an initial pilot, recruit about **15-25 participants** covering members, leads, board, advisory users, and a few invited guests if approved. The following are proposals to confirm after baseline research.

| Metric | Initial evaluation target |
|:---|:---|
| Weekly pilot activation | At least 70% of invited testers actively use the experience in week 2. |
| Common journey completion | At least 90% completion for selected login, task, meeting, file, and chat scenarios. |
| Cross-role permission testing | No unauthorised cross-project or guest access in the agreed negative test suite. |
| Critical chat correctness | No known message-loss, duplicate-acceptance, or revocation escape defect at pilot exit. |
| Perceived usefulness | At least 80% of respondents find their common workflows useful and easy to locate. |
| Operating readiness | Named owner, cost ceiling, monitored failures, documented rollback and tested restore. |

Also capture time-to-first-task, median journey duration, unsuccessful form submissions, notification usefulness, app crash-free sessions, queue delays, and help requests. Do not treat vanity metrics such as app downloads as evidence of effective club operations.

# 13. Adversarial and edge-case catalogue

A senior engineer must be able to point to designed behaviour for cases beyond the happy path.

**Identity and privilege:** expired member token; stolen device; revoked session while offline; role changed during a form submission; advisory member deep-linking into team instances; director attempting board-only approval; two accounts linked to the same email; email ownership change; invite forwarded to the wrong person.

**Projects and governance:** project archived during task editing; two leads change an owner concurrently; deleted department still referenced by a project; a member transferred while owning open tasks; case study published without client clearance; former director tries to view restricted meeting notes.

**Chat and attachments:** send retried after acknowledgement timeout; duplicate device connections; out-of-order delivery; connection drops during upload; room member removed mid-download; message references deleted attachment; rejected file disguised as a safe format; oversized history; moderation report submitted after sender leaves.

**Communications:** campaign confirmation submitted twice; SMTP temporarily unavailable; fallback provider also fails; provider acceptance not equivalent to inbox delivery; quota exceeded mid-campaign; subscriber unsubscribes while batch is queued; editor removed during scheduled send; mistaken attachment; newsletter draft unintentionally visible in public archive.

**Letters and records:** template changes while an official document is in review; a PDF generated without required signatory; browser session interrupted mid-issue; edited letter after issue; duplicate document number; restricted letter exposed through public object storage; device preview differs from downloadable PDF.

**Device and platform:** Android notification denied; app process killed during pending send; stale offline cache after access revocation; low-memory device; large font; intermittent network; lost/rotated mobile signing key; deployment introduces incompatible API changes.

Each selected release must define expected outcomes for the edge cases relevant to its features, along with a verification owner. Simply recording them as "known issues" is insufficient for sensitive operations.

# 14. Governance questions requiring explicit decisions

| Decision | Default for discussion | Owner |
|:---|:---|:---|
| Client workspace scope | Invite-only chat + deliberately shared engagement resources. | Board + project leadership |
| Who may invite guests | Named project owner/board role, not every member. | Board |
| Chat data retention and deletion | No production guest chat until policy is approved. | Board + privacy owner |
| Moderator access to private messages | No universal visibility; report-led narrow review. | Board |
| Client visibility of milestones | Explicit item-level share approval. | Project owner + board |
| Newsletter approval and suppression | Test send + authorised final review; respect opt-out and sending limits. | Communications owner |
| Formal letter issue control | Approver, numbering and retention defined by document category. | Board/secretariat |
| Device and account ownership | Club-controlled production, store and signing credentials. | Technical director + board |
| First distribution model | Closed Android pilot before wider distribution. | Product + technical owners |
| Operational spend ceiling | Set after scenario-based usage estimate. | Board/finance owner |
| Whether full native parity is required at launch | No; staged, honest feature status. | Product owner |

# 15. Feature catalogue and traceability

This catalogue is a **product backlog seed**. It describes outcomes, not a promise of a single release. "B" means the baseline mentions that capability; enhancements and mobile delivery remain proposed.

| Area | Baseline | Proposed website improvement | App experience |
|:---|:---|:---|:---|
| Public landing | B | Accessibility, clarity, publication controls | Read-only public information or link |
| Consulting request | B | Triage/ownership and conversion | Assigned follow-up, client status |
| Account request | B | Review queue, duplicate handling | Status/onboarding where allowed |
| Token/Google login | B | Safer session and recovery UX | Secure device-specific session |
| Member directory | B | Search, status, approved profile fields | Browse/search, limited sharing |
| Member administration | B | Approval and lifecycle audit | Safe board actions |
| Roles and departments | B | Policy clarity, history | Role-aware directory/workspaces |
| Role transfers | B | Reviewability and handover | Accept/decline where allowed |
| Department panel | B | Contextual work hub and decisions | Department home and resources |
| Global projects | B | Engagement lifecycle, scope, client boundary | Project home and action lists |
| Tasks | B | Priorities, blockers, owners, history | Fast updates and filters |
| Project assignments | B | Responsibility and history | Roster/role views |
| Team instances | B | Organiser flow, validation, export | Rosters/phases/allowed edits |
| Meetings | B | Agenda, minutes, decisions, follow-up | Calendar, links, action items |
| File manager | B | Resource permissions, search, revisions | Upload, browse, preview, share |
| Announcements | B | Audience, acknowledgement, scheduling | Read, acknowledge, alerts |
| Case studies | B | Editorial review and client approval | Browse and permitted editing |
| Newsletter subscription | B | Consent clarity and preference lifecycle | Read/subscribe where appropriate |
| Newsletter editor | B | Preview, approval, send status | Review/approve, editor tools |
| Send Mail | Proposal baseline; verify | Safer audience and send review | Permitted composition/review |
| Letter Studio (13 types) | Proposal baseline; verify | Template review, issue history | Preview/issue after feasibility |
| Maintenance | B | Clear owner and notices | Safe restricted screen |
| Public newsletter archive | B, separate site | Editorial continuity and deep links | Read/open published issues |
| Activity/notifications | N | Scoped activity centre | Push + in-app activity |
| Contextual chat | N | Project/dept/member rooms | Chat with reconnect and history |
| Guest invitations | N | Invite/revoke/scope administration | Email verification, limited workspace |
| Client engagement view | N | Shared milestones/deliverables | Restricted view and conversation |
| Approval centre | E/N | Unified actionable requests | Review/approve when allowed |
| Search across work | E/N | Permission-aware discovery | Narrow mobile search |
| Audit and operational health | E/N | Controlled history/status views | Limited on-call and board actions |
| Analytics and insights | O | Workload, usage, engagement summaries | Personal/dept insights if useful |
| AI assistance | O | Draft/summarise with strict access policy | Opt-in contextual assistant only |

# 16. Explicit exclusions, risks, and countermeasures

**Scope inflation:** a club platform can become an unmaintainable imitation of several enterprise products. Countermeasure: prioritise complete common journeys, phase modules, and require evidence before adding advanced settings.

**Security through UI only:** mobile pages may hide controls while a user can call endpoints directly. Countermeasure: server-owned authorisation, negative tests, access revocation, and explicit guest data boundaries.

**Newsletter deliverability confusion:** SMTP accepted does not imply inbox delivery; fallback and retries may duplicate mail without idempotency. Countermeasure: recipient/campaign lifecycle, suppression, observable retries, and send authorisation.

**Chat fragility:** real-time transport alone cannot guarantee history, ordering, or replay. Countermeasure: durable storage, idempotent client identifiers, cursors, and simulated reconnection tests.

**Official document inconsistencies:** rich editors and device PDF tools may produce different pagination or signatures. Countermeasure: validate representative templates and choose a documented canonical output method.

**Undocumented annual turnover:** a personal phone, inbox, provider login, or signing credential can become a single point of failure. Countermeasure: club-controlled custody, tested recovery, responsible owners, handover checklist.

**Inaccurate claims about baseline:** repo documents and old plans are not a substitute for observing real production flows. Countermeasure: discovery evidence, source citations, and explicit B/E/N labels.

# 17. Handoff: what the engineering team should produce next

The first engineering deliverable is **not an immediate full rewrite**. It is an evidence-backed discovery pack containing: a current-state feature/API map; role/resource permissions matrix; module risk register; UX journey map; a selected pilot feature set; information classification and guest policy; architectural options with costs and trade-offs; data-migration and regression strategy; test matrix; owner-approved privacy/retention rules; and an executable implementation plan broken into reviewable increments.

A practical delivery increment should state **user problem -> intended outcome -> affected roles -> source of truth -> negative cases -> acceptance tests -> rollback and operational owner**. Developers may ask the project sponsor to decide business and policy questions, but must not interpret missing deployment or framework instructions as permission to assume a particular architecture.

# Appendix A. Suggested screen inventory

**Website:** Public Home; Consulting Request; Member Login; Personal Home; My Work; Project Directory; Project Detail; Department Hub; People Directory; Member Profile; Team Instances; Meeting Detail; Files/Knowledge; Announcements; Communications; Newsletter Editor; Letter Studio; Consulting Intake; Approval Centre; Admin Roles/Access; Audit/Operations; Personal Settings.

**Android member:** Sign-in; Today; My Tasks; Project Detail; Department; Meetings; Chat List; Conversation; Resources; Activity; Profile; role-authorised Review/Administration.

**Android guest:** Invitation Acceptance; Verify Email; Assigned Engagement; Shared Deliverables; Assigned Conversation; Guest Profile/Access Expiry.

The complete screen count is for navigation mapping, not a requirement for one component/page per named item.

# Appendix B. References and evidence boundaries

- **[S1] User-provided source:** *180DC VIT Chennai Android App: Product Proposal and Implementation Roadmap*, dated 8 October 2026. Covers the proposed Android direction, module scope, chat/guest approach, technical options, and illustrative delivery model.
- **[R1] Source repository:** <https://github.com/180DC-VIT-CHENNAI/180dc-admin-website> (consulted 8 October 2026).
- **[R2] Repository product specification:** <https://github.com/180DC-VIT-CHENNAI/180dc-admin-website/blob/main/docs/product/product-spec.md> (consulted 8 October 2026).
- **[R3] Repository current state:** <https://github.com/180DC-VIT-CHENNAI/180dc-admin-website/blob/main/docs/execution/current-state.md> (consulted 8 October 2026).
- **[R4] Repository README:** <https://github.com/180DC-VIT-CHENNAI/180dc-admin-website/blob/main/README.md> (consulted 8 October 2026).

**Reading rule:** Source-backed descriptions of the current product are a starting point for validation, not a certification of the live deployment. Proposed features, recommended metrics, UX patterns, candidate implementation approaches, policy defaults, and priorities are authored proposals. This document does not assert that the website improvements or Android app already exist.

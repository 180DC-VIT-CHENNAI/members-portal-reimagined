# 180DC Admin Website - Complete Feature Report

> A simple, plain-English guide to every feature in the application.

---

## Table of Contents

1. [What Is This Application?](#1-what-is-this-application)
2. [Public Website (No Login)](#2-public-website-no-login)
3. [Login & Authentication](#3-login--authentication)
4. [Member Dashboard Overview](#4-member-dashboard-overview)
5. [Profile & Account Settings](#5-profile--account-settings)
6. [Member Directory](#6-member-directory)
7. [Projects](#7-projects)
8. [Blog](#8-blog)
9. [Case Studies](#9-case-studies)
10. [Departments](#10-departments)
11. [Meetings (Club, Department, Inter-Department)](#11-meetings)
12. [Real-Time Chat](#12-real-time-chat)
13. [File Manager](#13-file-manager)
14. [Email System](#14-email-system)
15. [Consulting Requests](#15-consulting-requests)
16. [Recruitments](#16-recruitments)
17. [Admin Console (Board Only)](#17-admin-console-board-only)
18. [Room Settings](#18-room-settings)
19. [Role Transfers](#19-role-transfers)
20. [AI Chatbot (ConsultAI)](#20-ai-chatbot-consultai)
21. [Announcements](#21-announcements)
22. [Maintenance Mode](#22-maintenance-mode)
23. [Security & Privacy](#23-security--privacy)
24. [Who Can Do What (Permission Levels)](#24-who-can-do-what-permission-levels)

---

## 1. What Is This Application?

This is the **internal admin website** for **180 Degrees Consulting (180DC) VIT Chennai**. It is a student-run consulting club's complete management platform.

Think of it as a **private workplace tool** (like a company intranet) where:
- **The public** can view the club's website, read blogs, see case studies, and submit consulting requests
- **Members** can log in to manage projects, chat with each other, share files, attend meetings, and handle club operations
- **Board members (leadership)** can manage everything: users, roles, departments, emails, recruitments, and club-wide settings

The entire system runs on cloud infrastructure (Cloudflare) and is accessible at **180dcvitc.org**.

---

## 2. Public Website (No Login)

These pages are visible to anyone on the internet.

### Landing Page
The main homepage at **180dcvitc.org** includes:

- **Animated Splash Screen** - A visually impressive intro animation that appears on your first visit. You click "ENTER" to dismiss it. It won't show again.

- **Navigation Bar** - Links to About, Network, Leadership, Case Studies, Blog, Projects, Partners, and a Login button. Has a dark/light mode toggle (sun/moon icon).

- **Hero Section** - Big banner with the tagline "Empowering Social Impact Through Strategy" and an animated gradient background.

- **About Section** - Shows 3 animated counters: number of projects completed, clients served, and active consultants. Includes a description of the club's journey.

- **Global Network** - An interactive 3D globe showing all 180DC chapters worldwide. You can rotate it and hover over markers to see chapter locations.

- **Leadership Team** - An animated organization chart showing the club's leadership structure.

- **Case Studies** - A grid of published case studies. Click any card to see the full details in a pop-up. Shows title, image, and category tag.

- **Blog** - Latest published blog posts. Click to read the full article on a separate page with title, author, category, tags, and full content.

- **Completed Projects** - Cards showing past projects with name, organization, year, and description.

- **Partners** - Cards showing partner organizations (MIT, Stanford, HBS, UNDP examples) with logos.

- **Footer** - Links to social media (Instagram, LinkedIn, YouTube, WhatsApp, Email), quick links, and contact information.

### Consulting Request Form
- Accessible from the footer "Email Us" button
- **Anyone** (clients, companies, organizations) can fill this out to request consulting services
- Fields: Name, Email, Phone, Organization, Role, Requirement (what they need help with)
- The club's board receives this request and can accept or reject it via email

### Blog Viewer (`/blog/:slug`)
- Individual blog post pages with full article content, author info, category, publication date, and images

### Public Blog Submission (`/post-blog`)
- **Anyone** can submit a blog post to the club
- Rich text editor with formatting (bold, italic, headings, lists, code blocks)
- Image upload support (drag-and-drop or file picker)
- Category selection (General, Strategy, Case Study, Event, Tutorial, Industry Insight)
- Tags support (comma-separated)
- Posts go into a "pending" queue for board approval
- Preview mode to see how the blog will look before submitting

### Account Request (`/request-account`)
- Anyone can request a member account by providing name, email, department, and an optional message
- Board reviews and approves/rejects requests

### Recruitment Page (`/recruitments`)
- Full recruitment flow for new members (detailed in [Section 16](#16-recruitments))

---

## 3. Login & Authentication

### How Members Log In
Go to **180dcvitc.org/members** to access the login page.

**Two login methods:**

1. **Google Sign-In (Recommended)** - Click "Sign in with Google" to log in with your Google account. This is the easiest method. Your Google account must be linked to your club membership first.

2. **Token Login** - Enter your email and your personal access token (a long random string). Board gives you this token when your account is created. If you've lost it, click "Forgot Password?" and your token will be emailed to you.

### How the Token System Works
- Every member gets a **unique access token** (like a password, but much longer and more secure)
- This token is your key to log in - treat it like a password
- Board can create, revoke, or rotate tokens at any time
- Tokens can expire after a set time
- If your token is compromised, board can instantly revoke it and issue a new one

### Linking Google Account
- Once logged in, you can link your Google account from the Profile page
- After linking, you can use "Sign in with Google" for future logins
- You can disconnect Google at any time from Profile

### Forgot Token
- Click "Forgot Password?" on the login page
- Enter your email address
- Your token will be emailed to you (if your account exists)

### Dual Role Login
- Some members have two roles (e.g., a Technical Lead who is also a Director)
- When logging in, you'll be asked to choose which role you want to use for this session
- This determines what you can see and do in the dashboard

### Session Expiry
- Sessions last for a set period
- If your session expires, a red banner appears at the top: "Your session has expired. Please log in again."
- You'll be redirected to the login page

### Auto-Logout
- If inactive for 7 days, you're automatically logged out for security

---

## 4. Member Dashboard Overview

After logging in, you see the **member dashboard** with a sidebar navigation.

### Sidebar
- Collapsible sidebar (click the hamburger icon on mobile)
- 180DC logo and club name
- **Status Banner** - Shows your role and department with a color-coded background
- **Dark/Light Mode Toggle** - Switch between dark and light themes
- **Navigation Menu** - Different items appear based on your role (see [Section 24](#24-who-can-do-what-permission-levels))
- **Logout Button** at the bottom

### Dashboard Home
Shows a summary with:
- Member count, project count, upcoming meets, announcements
- Today's email count
- Recent meetings
- Quick stats at a glance

---

## 5. Profile & Account Settings

Accessible to all logged-in members from the sidebar.

### User Information Card
- Your display name, email, user ID, role badge (colored by seniority), and department

### Access Token Management
- View your current token (hidden by default for security)
- Copy token to clipboard
- **Rotate Token** - Generates a new token and emails it to you (old token is deleted)

### Google Account Connection
- Shows whether your Google account is linked
- "Connect Google Account" button to link it
- "Disconnect" button to unlink it

### Change Password
- For members who log in with email/password
- Enter current password, new password, confirm new password

### Role Switching (Dual Role Users)
- If you have two roles, a dropdown lets you switch between them
- Changes what you can access for the rest of your session

---

## 6. Member Directory

Accessible to all logged-in members from the sidebar.

- **Full list of all members** with name, email, role badge, and department badge
- **Search** - Type to filter by name or email
- **Filter by Role** - Dropdown to show only members with a specific role
- **Export to CSV** - Board members can download the entire member list as a spreadsheet file
- Test accounts (used for development) are marked with a special badge

---

## 7. Projects

Accessible to all logged-in members from the sidebar.

### Project List
- Card grid showing all projects you have access to
- Each card shows: project name, company/organization, year, assigned departments, status (Active/Archived/Completed), progress bar (tasks done vs. total), deadline
- Overdue deadlines are highlighted in red
- Click a card to view its tasks

### Search & Filter
- **Search** by project name
- **Sort** by Newest, Oldest, Alphabetical, or Deadline
- **Filter** by status: All, Active, Archived, Completed
- **Filter by Department** - Show only projects assigned to a specific department

### Create Project (Board Only)
- Project Name, Company/Organization, Year, Deadline (date picker), Description
- Select one or more departments to assign the project to
- Department leads receive an email notification when a new project is assigned

### Project Tasks
- View all tasks within a project
- **Create Task** - Title and optional description
- **Mark Task Done** - Click the checkmark to complete a task
- **Complete All Tasks** - Mark all pending tasks as done at once
- **Finish Project** - Mark the entire project as completed (board only, when all tasks are done)
- Progress shown as "Tasks completed / total"

### Project Roles
- Board can assign members to projects with custom role names (e.g., "Data Analyst", "Lead Designer")
- The assigned person receives an email notification

---

## 8. Blog

Accessible to all logged-in members from the sidebar.

### Blog Management
- **Create Blog** - Rich text editor with full formatting (bold, italic, headings, lists, blockquotes, code blocks)
- Image upload (drag-and-drop, file picker, or paste URL)
- Category selection: General, Strategy, Case Study, Event, Tutorial, Industry Insight
- Tags (comma-separated)
- Auto-generated URL slug from the title
- Preview mode to see how it looks before submitting
- Submit for review (goes to "pending" status)

### Blog Approval (Board Only)
- See all pending blogs awaiting approval
- Read the full blog content
- **Approve** - Publishes the blog to the public website
- **Reject** - Denies the blog (with optional feedback)
- **Edit** - Modify any blog post (title, content, image, category, tags, slug)
- **Delete** - Permanently remove a blog post
- **Bulk Approve** - Select multiple pending blogs and approve them all at once

### Blog Statuses
- **Pending** - Submitted, waiting for board review
- **Approved** - Published on the public website
- **Rejected** - Denied by board

---

## 9. Case Studies

Accessible to all logged-in members from the sidebar.

- **Create Case Study** - Title, category tag, image upload, and rich text description
- **Edit Case Study** - Modify any field
- **Delete Case Study** - Remove with confirmation
- **Toggle Public/Private** - Control whether a case study appears on the public website
- **Reorder** - Drag and drop to change the display order on the public site
- **View** - All members can see all case studies (public and private)
- Board members can manage all case studies; regular members can create and edit their own

---

## 10. Departments

The club has 8 departments:
1. **Technical** - Technology, development, infrastructure
2. **R&D (Research & Development)** - Research, innovation
3. **Marketing** - Promotion, outreach, branding
4. **Social Media** - Online presence, content creation
5. **Finance** - Budgets, accounting, financial planning
6. **Events & Initiatives** - Organizing events, campaigns
7. **Client Partner Sponsor** - Client relations, partnerships
8. **HR (Human Resources)** - Member management, culture

### Department Panel
Each department has its own panel (visible to members of that department + board):

- **Department Header** - Name and icon
- **Schedule Meet** - Create a department meeting with title, date/time, description, location/link, and optional email notifications to all department members
- **Post Instructions** - Department leads can write and post instructions/policies for their team (rich text with priority levels: low/medium/high)
- **Member List** - See all members in your department with their roles
- **Email Members** - Send an email to individual members or to all department members at once

---

## 11. Meetings

Three types of meetings, each with scheduling and email notification features.

### Club-Wide Meets
- For the entire club (all members)
- **Create** - Title, date/time, description, Google Meet link or venue
- **Email Notifications** - Toggle on/off; when enabled, all members receive an email
- **Edit/Delete** - Modify or remove meets
- **Send Notification** - Manually re-send email notifications for an existing meet
- Only board members can create/manage club meets

### Department Meets
- For specific departments
- **Create** - Same as club meets, but assigned to a department
- **Email Notifications** - Only department members receive the email
- Department leads can create meets for their own department
- Board can create meets for any department

### Inter-Department Meets
- For members across multiple departments
- **Create** - Select which departments are involved (multi-select)
- **Email Notifications** - Members of selected departments receive the email
- Only board members can create inter-department meets

### Email Delivery
- Emails are sent automatically when a meet is created (if notifications are enabled)
- Spacemail SMTP sends in BCC batches of up to 50 recipients; limit of 500 messages per hour
- If the limit is hit, extra emails are queued and can be sent later by board via "Process Queue"
- Emails are sent from `technical@180dcvitc.org` with a branded HTML template

---

## 12. Real-Time Chat

Accessible to all logged-in members from the sidebar.

### Chat Rooms
- **General** - Open to all members (except pure advisory members without a secondary role)
- **Board** - Board members only (power level 100+)
- **Advisory** - Advisory board members + leads and above
- **Department Rooms** (e.g., Technical, Marketing) - Members of that department + board

### Features
- **Real-time messaging** - Messages appear instantly for all users in the room
- **@Mentions** - Type `@` followed by a name to mention someone; they get highlighted
- **Typing Indicators** - See when someone else is typing
- **Online Presence** - See who's currently in the room
- **Message History** - Last 6 months of messages are loaded when you join
- **Older Messages** - Archived messages (older than 6 months) can be loaded on demand
- **Date Separators** - Messages are grouped by date
- **Role Badges** - Each message shows the sender's name and role badge
- **Test Account Badges** - Development accounts are marked with a special badge
- **Mobile Responsive** - Works on phones with a hamburger menu for room selection

### Polls in Chat
- **Create Poll** - Ask a question with 2-10 options
- **Vote** - Click on an option to cast your vote (one vote per person)
- **Results** - See vote counts and percentage bars
- **Close Poll** - The poll creator can close voting
- **Delete Poll** - The poll creator can remove it

### Rate Limiting
- Maximum 10 messages per second per user (prevents spam)
- Maximum 2,000 characters per message

---

## 13. File Manager

Accessible to all logged-in members from the sidebar.

### File Categories
Files are organized into 3 tabs:
- **General** - General club documents
- **Projects** - Project-related files
- **Events** - Event-related files

### Features
- **Upload Files** - Drag-and-drop or file picker (leads and above)
- **Add Metadata** - Event name, project name, meeting name when uploading
- **Download** - Click to download any file
- **Delete** - Remove files with confirmation (leads and above)
- **Search** - Filter by filename
- **Filter by Event** - Dropdown showing all events with uploaded files
- **Filter by Project** - Dropdown showing all projects with uploaded files
- **File Details** - Each file shows: name, upload date, file size, who uploaded it

Files are stored securely in cloud storage (Cloudflare R2).

---

## 14. Email System

### Types of Emails the System Sends

1. **Access Token Email** - Sent when a new member is added or token is rotated. Contains the member's login token with a branded HTML template.

2. **Meet Notification Email** - Sent when a meeting is created (if notifications enabled). Contains meeting title, description, date/time, and link/venue.

3. **Project Assignment Email** - Sent to department leads when a new project is assigned to their department.

4. **Role Assignment Email** - Sent to a member when they're assigned a role on a project.

5. **Role Change Email** - Sent when a member's role is changed (e.g., promoted from member to lead).

6. **Consulting Response Email** - Custom email sent when board accepts or rejects a consulting request.

7. **Manual Email** - Board can compose and send arbitrary emails to selected members.

### Manual Email Sending (Board Only)
- Select recipients from the member list (with checkboxes)
- Search and filter by role
- Manually add email addresses
- Compose subject and body
- All emails use a branded 180DC HTML template

### Email Limits
- Spacemail SMTP: maximum 500 messages per hour, up to 50 BCC recipients per message
- If the SMTP limit is reached, remaining recipients are reported as queued; meet emails are stored for later delivery
- Board can manually process the meet queue
- Bulk emails share one body across a BCC batch, so unsubscribe links point to the public `/unsubscribe` page

---

## 15. Consulting Requests

When external organizations visit the website and submit a consulting request:

### For the Public (Submitting a Request)
- Fill out the form: Name, Email, Phone, Organization, Role, What you need help with
- Submit and wait for the club to respond

### For Board Members (Managing Requests)
- View all incoming requests with status filters (All/Pending/Accepted/Rejected)
- **Accept** - Opens an email composer to write a response, then sends it
- **Reject** - Same flow, sends a rejection email
- **Delete** - Remove a request permanently
- All responses are logged for reference

---

## 16. Recruitments

A complete recruitment system for bringing new members into the club.

### For Applicants

**Step 1 - Landing Page** (`/recruitments`)
- "Applications are Open!" with description of the club
- "Apply Now" button to start

**Step 2 - Registration**
- Create an account with Name, Email, Password, Confirm Password
- Password must be 8+ characters with uppercase, lowercase, number, and special character

**Step 3 - Application Form (5 Pages)**

1. **Domain Selection** - Choose your preferred domain: Technical, R&D, or Marketing

2. **Personal Information** - Name, Email (locked), Phone, VIT Roll Number, Year of Study, CGPA

3. **Resume Upload** - Upload a PDF resume (drag-and-drop, file picker, or URL). Max 5MB, PDF only.

4. **Essay Questions** (5 questions):
   - Why do you want to join 180DC?
   - Describe a consulting case/project you admire
   - How would you handle a client disagreement?
   - What skills do you bring to the team?
   - Additional information (optional)

5. **Review & Submit** - See a summary of everything you entered. Edit any section before final submission.

- **Auto-Save** - Your progress is automatically saved. You can close the browser and come back later.
- **Track Application** - After submitting, see your application status on a tracker with 5 stages: Submitted, Under Review, Shortlisted, Interview Scheduled, Decision

### For Board/Leads (Reviewing Applications)
- View all applications with filters by domain and status
- **Application Detail** - See all fields: personal info, resume, and all 5 essay responses
- **Evaluation System** - Score each application on multiple criteria (1-10 scale) with notes
- **Bulk Shortlist** - Automatically shortlist top applicants by evaluation score
- **Status Actions**: Shortlist, Select, or Reject applicants
- **Domain Settings** - Configure which domains are open for applications

---

## 17. Admin Console (Board Only)

The most powerful section - only accessible to board members (power level 100+).

### User Management
- **View All Users** - List with name, email, role, department
- **Add User** - Create a new member account with name, email, password, role, department
- **Edit User** - Change any user's details
- **Delete User** - Remove a member (with confirmation). Cannot delete other Presidents/VPs.
- **Reset Password** - Generate a new password for a user

### Role Management
- **View All Roles** - List with name, power level, and color
- **Add Role** - Create a new role with name, power level (number), and color
- **Edit Role** - Modify role details
- **Delete Role** - Remove a role (with confirmation)

### Department Management
- **View All Departments** - List with name, ID, and assigned lead
- **Add Department** - Create a new department
- **Edit Department** - Modify department details
- **Delete Department** - Remove a department (with confirmation)
- **Assign Lead** - Set which member leads the department
- **Remove Lead** - Remove the department lead

### Token Registry
- View all active login tokens
- See token (masked), user name, role, and issue date
- **Revoke Token** - Instantly disable any token

### Board Members List
- Quick view of all board members

### Department Leads List
- Quick view of all department leads

---

## 18. Room Settings (Board Only)

Control which chat rooms are active.

- See all chat rooms with enable/disable toggles
- **Enable/Disable Individual Rooms** - Toggle any room on or off
- **Enable All** - Turn on all rooms at once
- **Disable All** - Turn off all rooms at once
- When a room is disabled, no one can send messages in it

---

## 19. Role Transfers

A system for transferring roles between members.

### For Board (Initiating Transfers)
- Create a transfer: select "from" user, "to" user, and the role being transferred
- **Approve Transfer** - Board can approve, which assigns the role to the "to" user and demotes the "from" user to member
- **Reject Transfer** - Board can reject the transfer
- President/VP roles cannot be transferred

### For Members (Accepting/Declining)
- Members can see pending transfers where they're involved
- **Accept** - Agree to the transfer
- **Decline** - Reject the transfer
- The transfer only executes when BOTH parties accept

---

## 20. AI Chatbot (ConsultAI)

A public AI assistant accessible from the floating chat button on the landing page.

### Features
- **Floating Button** - A chat bubble icon appears in the bottom-right corner of the public website
- **Chat Window** - Opens a full chat interface with a welcome message
- **Ask Anything** - Type questions about business strategy, consulting, market research, SWOT analysis, etc.
- **Quick Actions** - 6 preset suggestion chips:
  - SWOT Analysis
  - Business Strategy
  - Market Research
  - Competitor Analysis
  - Startup Validation
  - Pricing Strategy
- **Markdown Responses** - AI responses support formatted text (bold, lists, code blocks, etc.)
- **Copy Response** - Click to copy any AI response to clipboard
- **Clear Chat** - Trash icon to start a fresh conversation
- **Error Handling** - If the AI fails, shows an error with a retry button

### How It Works
- Uses Google Gemini 2.5 Flash AI model
- Trained with a system prompt that defines it as "ConsultAI" - an expert business consultant for 180DC
- Remembers your full conversation within a session
- Completely free to use (no login required)

---

## 21. Announcements

- Board can create announcements with a title and content
- All members can see announcements
- Board can delete announcements
- Displayed on the dashboard for visibility

---

## 22. Maintenance Mode

- Board can enable maintenance mode with a custom message
- When enabled, only President and Vice President can access the site
- All other members see the maintenance message
- Used for scheduled downtime or updates

---

## 23. Security & Privacy

### Authentication Security
- Tokens are hashed before storage (even if the database is compromised, raw tokens aren't exposed)
- Passwords use PBKDF2 with 600,000 iterations (extremely hard to crack)
- Google OAuth integration (industry-standard secure login)

### API Security
- Every endpoint is rate-limited (prevents abuse)
- CORS restricted to approved domains only
- CSRF protection on all state-changing requests
- All user input is sanitized and length-checked
- HTML content is sanitized with an allowlist (prevents XSS attacks)

### Data Security
- HTTPS enforced everywhere (encrypted data in transit)
- Security headers on every response (X-Content-Type-Options, X-Frame-Options, etc.)
- Audit logging of all significant admin actions
- Token previews are masked (only first 8 characters shown)
- Email enumeration prevention (forgot-token always returns success)

### Infrastructure
- Hosted on Cloudflare (global CDN, DDoS protection)
- Database backups via Cloudflare D1
- File storage via Cloudflare R2 (encrypted at rest)

---

## 24. Who Can Do What (Permission Levels)

The system has a power level hierarchy:

| Power Level | Role Type | Examples |
|---|---|---|
| **100** | Board / President | President, Vice President, Technical Director |
| **70-80** | Senior Board | Marketing Director, Secretary, Business Strategy Director |
| **50** | Department Leads | Technical Lead, R&D Lead, Marketing Lead, Finance Lead, etc. |
| **30** | Advisory Board | Advisory members |
| **10** | General Members | Regular club members |

### What Each Level Can Do

| Feature | General Member (10) | Lead (50) | Board (100) |
|---|---|---|---|
| View landing page | Yes | Yes | Yes |
| Submit blog posts | Yes | Yes | Yes |
| View projects | Assigned projects | Assigned projects | All projects |
| Create projects | No | No | Yes |
| Manage tasks | Own dept projects | Own dept projects | All projects |
| Create case studies | Yes | Yes | Yes |
| Approve blogs | No | No | Yes |
| Send emails | No | No | Yes |
| Manage users | No | No | Yes |
| Manage roles | No | No | Yes |
| Manage departments | No | No | Yes |
| Create club meets | No | No | Yes |
| Create dept meets | No | Own dept | Any dept |
| Create inter-dept meets | No | No | Yes |
| Upload files | No | Yes | Yes |
| Delete files | No | Yes | Yes |
| Manage chat rooms | No | Toggle own dept | All rooms |
| View member directory | Yes | Yes | Yes |
| Export members CSV | No | No | Yes |
| Handle consulting requests | No | No | Yes |
| Review recruitments | No | Yes | Yes |
| Enable maintenance mode | No | No | Yes |
| Post department instructions | No | Own dept | Any dept |
| Schedule dept meetings | No | Own dept | Any dept |
| Access all chat rooms | No | No | Yes |

---

*Report generated for the 180DC VIT Chennai Admin Website.*
*Last updated: July 14, 2026*

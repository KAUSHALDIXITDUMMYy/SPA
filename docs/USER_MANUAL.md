# Sportsmagician Audio — User Manual

This guide explains how **administrators**, **publishers**, and **subscribers** use the web application after an account has been created for them.

---

## 1. Signing in and roles

1. Open the app home page and sign in with the **email** and **password** your organization provided.
2. After a successful sign-in, you are sent to `/dashboard`, which **redirects automatically** based on your role:
   - **Admin** → Admin Dashboard (`/admin`)
   - **Publisher** → Publisher Dashboard (`/publisher`)
   - **Subscriber** → Subscriber Dashboard (`/subscriber`)

You only see the dashboard that matches your role. If something looks wrong, confirm with your administrator that your account role and **active** status are correct.

---

## 2. Administrator guide

Admins manage users, assignments, schedules, moderation, and (optionally) live operations.

### 2.1 Header actions

- **Logout All Users** — Clears stored sessions so people can sign in again from any browser. Use when you want a clean break before a big event (for example, resetting who is logged in where).
- **Sign Out** — Signs out only you.

### 2.2 Navigating the admin panel

- **Tablet and desktop (medium screens and up):** Use the **tab bar** at the top of the main area to switch sections.
- **Phone:** The tab bar is hidden. Tap the **menu (☰)** button next to **Admin Dashboard** to open **Jump to section** and pick a screen. The current section name also appears under your welcome line.

### 2.3 Sections (what each tab is for)

| Section | Purpose |
|--------|---------|
| **User Management** | Create and manage users (roles, active/inactive, profile fields, and related options your build exposes). |
| **Live rooms** | See **active** audio stream sessions, **end** a session (marks it inactive in the system), **reassign** the publisher on the record (metadata only—the current broadcaster should still stop on their side), and open **room chat** to read publisher, privileged subscriber, and admin messages. |
| **Analytics** | View usage and stream-related analytics (as implemented in your deployment). |
| **Publisher Assignments** | Control which subscribers are assigned to which publishers (who can hear whom). |
| **Stream Assignments** | Manage how streams / sessions are assigned in the system (as implemented in your deployment). |
| **Today's Schedule** | Two parts: (1) **plain-text schedule** subscribers can read on their **Today's Schedule** tab; (2) **Scheduled calls & rooms**—timed slots with fixed **room IDs** and assigned publishers. You can add calls one at a time or use **Import from schedule paste** if your app includes it, using the same text format as the plain schedule (date line + lines with times and titles). |
| **Contact** | Read messages sent through the contact flow (if used). |
| **Reports** | Review user reports and moderation items (if used). |
| **Notifications** | Send or manage subscriber notifications / broadcasts (as implemented in your deployment). |

Exact field names and advanced options may vary slightly as the product evolves; use on-screen descriptions as the final word.

### 2.4 Tips for admins

- **Deactivated users** cannot use publisher or subscriber features until you set them **active** again.
- **Ending a live room** updates the database; the publisher should still **stop broadcasting** in their dashboard so the audio platform fully disconnects.
- **Reassigning publisher** on a live room updates **who the session is attributed to** in the app; it does not automatically move the live audio feed to someone else’s computer.

---

## 3. Publisher guide

Publishers are the people who **start and stop** audio streams that subscribers listen to.

### 3.1 When you sign in

You land on the **Publisher Dashboard**. If your account is **inactive**, you will see a clear message that you cannot stream; contact an administrator.

### 3.2 Today’s scheduled rooms (if your admin uses them)

If your organization uses **scheduled calls**:

1. You will see **today’s scheduled rooms** assigned to **you**.
2. Choose the slot you are about to cover, then use the stream controls to **go live in that scheduled room** so the **room ID** matches what subscribers expect.

While you are already live, scheduled-room picking is typically disabled so you do not switch rooms by mistake.

### 3.3 Going live (stream controls)

Use the **Stream controls** section to:

- Set a **title** (and any other fields your screen shows, such as **sport / category**).
- Choose **audio source** (for example microphone vs system audio), per your UI.
- **Start** the stream when you are ready.
- **Stop** the stream when you are finished.

When you are live, the header usually shows a **LIVE** indicator with your stream title (and sport, if set).

### 3.4 Live chat with subscribers

If **chat** is enabled for your account and the subscriber has **chat privilege** for your stream, you can use the **live chat** panel on the stream screen to read and reply to those subscribers. Subscribers without chat access will not be part of that conversation.

### 3.5 Mobile

On small screens, **Sign out** may appear inside the **menu** sheet instead of the top bar.

### 3.6 Best practices

- Confirm with admin whether you should use **ad-hoc** rooms or **scheduled** room IDs for each event.
- Always **end** the stream when you are done so listeners and analytics stay accurate.
- If you were **logged out everywhere** after an admin used “Logout All Users,” sign in again normally.

---

## 4. Subscriber guide

Subscribers **listen** to streams they are allowed to hear and can view schedules and notifications their organization enables.

### 4.1 When you sign in

You land on the **Subscriber Dashboard**. If your account is **inactive**, you cannot listen or use normal content until an administrator reactivates you.

### 4.2 Main tabs (typical layout)

| Tab | Purpose |
|-----|---------|
| **Audio Streams** | Lists **live streams** you have **permission** to access. Pick a stream to listen. You may be able to **filter by sport** if your UI offers it. The list refreshes periodically. |
| **Scheduled calls** | Shows **today’s scheduled calls** (titles, times, who is assigned). Listening still happens from **Audio Streams** when that publisher is live in the right room. |
| **Notifications** | Alerts or messages from your organization (as configured). |
| **Today's Schedule** | The **plain-text schedule** the admin maintains (game times and notes as text). |

You only see streams for publishers (and assignments) your administrator has set up for your account.

### 4.3 Listening to a stream

1. Open **Audio Streams**.
2. Choose a stream from your list.
3. Use the on-screen controls to **join** / **leave** audio as guided by the app (listen through your device speakers or headphones).

If a stream does not appear, you may not be assigned to that publisher, or nobody is live yet.

### 4.4 Chat (privileged subscribers)

If your administrator enabled **chat** for you on a given stream, you can use **live chat** while viewing that stream to message the **publisher** (and admins may also participate from their tools). If you do not have chat access, you can still listen but will not see chat input.

You may be able to **report** or **block** users in chat where the UI provides those actions.

### 4.5 Mobile

On small phones, use the **menu** button for **Sign out** if it is not shown in the header row.

---

## 5. Getting help

- Use your organization’s **admin contact** for access, assignments, schedule mistakes, or account status.
- If the product exposes **Contact us** or **Terms** on the login page, those links apply to your deployment’s policies.

---

## 6. Document info

- **Product:** Sportsmagician Audio — professional audio streaming management (web app).
- This manual describes **intended use** of role-based dashboards; your Firebase security rules and hosting setup must allow the actions you expect (for example, admin updates to live sessions).

If internal workflows change, ask your development team to update this file alongside the app.

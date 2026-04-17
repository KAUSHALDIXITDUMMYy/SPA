# Sportsmagician Audio — User Manual

This guide is for **publishers** and **subscribers** who use the web app day to day. Share it as a **FAQ-style reference** so people can self-serve. Administrators have a separate panel; a short admin section is included for context.

---

## 1. Signing in, roles, and account status

1. Open the app and sign in with the **email** and **password** your organization provided.
2. After sign-in you go to `/dashboard`, which **redirects by role**:
   - **Admin** → `/admin`
   - **Publisher** → `/publisher`
   - **Subscriber** → `/subscriber`

You only see the dashboard for your role. If that is wrong, ask your administrator to check your **role** and **active** status.

### Real-time account activation

If an administrator **activates** or **deactivates** your account while you are logged in, you will get an **on-screen notification (toast)**. If you are deactivated, follow the instructions on the page and contact your admin.

---

## 2. Administrator guide (short)

Admins manage users, assignments, schedules, live rooms, and notifications. This manual focuses on publishers and subscribers; admins should use the **Admin Dashboard** tabs (User Management, Live rooms, Publisher Assignments, Today’s Schedule, etc.) as labeled in the product.

**Important reminders for admins:**

- **Deactivated users** cannot publish or use subscriber content until set **active** again.
- **Ending a live room** in admin updates the database; the publisher should still **End Stream** on their side so the audio session fully disconnects.
- **Reassigning** a live room changes **who the session is attributed to** in the app; it does not move the audio from one computer to another by itself.

---

## 3. Publisher guide

Publishers **start and stop** audio streams that subscribers hear. The dashboard has two main areas: **today’s scheduled rooms** (if your org uses them) and **stream controls**.

### 3.1 Inactive account

If your account is **inactive**, you will see an **Account Inactive** message. You cannot start streams or use publishing features until an administrator reactivates you.

### 3.2 Today’s scheduled rooms

If your organization uses **scheduled calls**:

- You see **Today’s scheduled rooms** for **today’s date**, listing slots assigned to **you**.
- The list can also include scheduled rooms you are **currently hosting** (for example after a reassignment), even if the calendar view is out of sync—**refresh the page** if your admin just changed an assignment.
- Each row shows the **title**, **time range**, **room ID**, and badges such as:
  - **In time window** / **Outside window** (relative to the scheduled slot).
- Use **Broadcast here** to select that slot. **Clear selection** deselects it.
- While you are **already live**, choosing another scheduled room is **disabled** so you do not switch rooms by accident.

**If you see no scheduled rooms:** your admin may not have assigned you, or you may need a refresh after changes. Confirm with your admin that the correct publisher is selected on the scheduled call.

### 3.3 Two ways to go live

| Mode | When to use | What happens |
|------|-------------|--------------|
| **Scheduled room broadcast** | You selected a slot under **Today’s scheduled rooms** | The app uses the **admin-assigned room ID** and the call’s title/metadata. You click **Go live in scheduled room**. |
| **Ad-hoc audio stream** | No scheduled slot, or you clicked **Use ad-hoc stream instead** | You set your own **title**, optional **description**, **sport / category**, and the app creates a **new room** for that broadcast. You click **Start Audio Stream**. |

**Scheduled room card:** shows the **room ID** (fixed for that game). **Ad-hoc card:** explains that this stream is **not** tied to today’s scheduled calls—use the scheduled section when you were assigned a room.

### 3.4 Audio source: microphone vs system

Before or during a broadcast you choose **Audio source**:

- **Microphone** — what you say into the mic is sent to listeners.
- **System audio** — the browser will ask you to **share a tab, window, or screen**. **Only audio is sent to listeners**, not your screen video. For a browser tab, enable **Share tab audio** when the picker appears (Chrome). What you can capture depends on your **OS and browser**.

If **system audio** fails to start (permissions, browser, etc.), the app may fall back to **microphone** and show a **warning message**—you are still live; fix sharing and switch source when ready.

While **live**, you can **switch between microphone and system** using the same control (there may be a short loading state).

### 3.5 Starting, ending, and recovering a stream

- **Start:** complete the fields, choose audio source, then **Go live in scheduled room** or **Start Audio Stream**.
- **End:** use **End Stream** when you are completely finished. For scheduled rooms, this also resets the scheduled session in the system as implemented.
- **Rejoin after refresh:** if your stream is still **active in the system** but you closed or refreshed the page, you may see **Rejoin Your Active Stream**. Pick audio source and **Rejoin Stream** to continue broadcasting.
- **Use Last Details** (ad-hoc): fills **title**, **description**, and **sport** from your **most recent ended** stream so you do not retype them.

### 3.6 While you are live

- The **header** shows a **LIVE** pill with your **title** (and sport when set).
- The live card can show a **Scheduled room** badge when applicable.
- **Mute broadcast** / **Unmute broadcast** temporarily stops or restores what listeners hear from your capture path.
- **Stream chat:** if chat is enabled for your deployment, you can use the **chat panel** on the live card to talk with **privileged subscribers** and admins; subscribers without chat access will not participate.

**Browser tab / minimize:** if audio stops when you **minimize** the window or switch away, **return to this tab** so the connection can recover. On desktop, the app may suggest using a **popup window** before starting for a more stable session; on mobile, **split screen** is suggested when relevant.

### 3.7 Mobile (publisher)

On small screens, **Sign out** may appear under the **menu** (☰) instead of the top bar.

### 3.8 Publisher FAQ

| Question | Answer |
|----------|--------|
| Do I have to use a scheduled room? | Only when your org assigned you to a **scheduled call**. Otherwise use **Ad-hoc audio stream**. |
| I picked the wrong scheduled slot | **Clear selection** or choose **Use ad-hoc stream instead**, then start the mode you need. |
| I refreshed and my dashboard says I’m not live but listeners still hear me | Rare edge cases aside, use **Rejoin Your Active Stream** if it appears, or ask an admin to check **Live rooms** and end the session if needed. |
| System audio will not start | Check browser permissions for **screen/tab capture**. You may be live on **microphone** until you fix it. Use **Chrome** and **Share tab audio** for browser content. |
| Why are scheduled picks disabled? | You are **already broadcasting**. End the stream first if you need to change mode. |

---

## 4. Subscriber guide

Subscribers **listen** to audio they are allowed to hear and can view schedules and notifications the organization enables.

### 4.1 Inactive account

If your account is **inactive**, you cannot listen or use normal content until an administrator reactivates you.

### 4.2 Main tabs (what each one is for)

The subscriber dashboard uses **tabs**. On narrow screens the labels shorten (for example **Streams**, **Calls**, **Alerts**, **Schedule**).

| Tab | Purpose |
|-----|---------|
| **Audio Streams** | **Publisher-started “direct” streams only** — not tied to an admin **scheduled game room**. Lists live ad-hoc broadcasts you have permission to hear. **Auto-updates** about every **5 seconds**. |
| **Scheduled calls** | **Scheduled game / room audio** — the admin-assigned rooms (for example `sched-…` or linked scheduled calls). This is where you listen to **scheduled** coverage. |
| **Notifications** | Alerts or messages from your organization (as configured). |
| **Today’s Schedule** | The **plain-text schedule** your admin maintains (times and notes as text). |

**This split is important:** if you look for a **scheduled game** under **Audio Streams**, you may not find it. **Scheduled rooms** are under the **Scheduled calls** tab.

### 4.3 Audio Streams tab (direct / ad-hoc)

- The list is sorted by **publisher name**.
- Use **Filter by sport** to narrow by category: **All sports**, **Not specified**, or a specific sport.
- Each card shows **LIVE** when the publisher is actively broadcasting that direct stream (plus sport/title as shown).
- **Select** a stream to listen. On **desktop**, you may see the list on the left and the player on the right; on **mobile**, the list and player stack and you can **tap another stream to switch** (the app stops the previous session before starting the next).
- If the list is empty, there may be **no direct ad-hoc streams** right now—scheduled games are under **Scheduled calls**.

### 4.4 Scheduled calls tab (scheduled rooms)

- Lists **scheduled-room** streams you can access, with **LIVE**, **In window**, **Upcoming / ended**, and **Waiting for host** style states as shown in the UI.
- **Select a room** to open the player and listen. **Scheduled games stay in this tab**; casual publisher streams are under **Audio Streams**.
- The list **refreshes periodically** (similar polling to the other tab).

### 4.5 Listening behavior

- Audio plays through your **device speakers or headphones** according to your system volume.
- Use **Stop** / **Back to Streams** (wording may vary by screen size) to **leave** a stream when you are done.
- Switching to another stream **leaves** the current one first so you do not stay connected to two rooms at once.

### 4.6 Chat

If your administrator enabled **chat** for your account, you can use **live chat** while listening (including a **floating** chat experience on small screens when applicable). If you do not have chat access, you can still listen but will not send chat messages.

### 4.7 Mobile (subscriber)

Use the **menu** button for **Sign out** if it is not in the header row.

### 4.8 Subscriber FAQ

| Question | Answer |
|----------|--------|
| I don’t see the game under Audio Streams | **Scheduled** games are under the **Scheduled calls** tab. **Audio Streams** is only for **direct / ad-hoc** publisher streams. |
| What does “Waiting for host” mean? | The **room exists** in the system but the **publisher has not started broadcasting** yet (or the session is in a pre-broadcast state). Keep the tab open or check back. |
| Why is my list empty? | You may not be **assigned** to that publisher, nobody is **live**, or everything is under the **other** tab (direct vs scheduled). Ask your admin about **assignments**. |
| Can I listen to two streams at once? | Switching streams **stops** the previous one. |
| Sport filter shows no results | Try **All sports** or **Not specified**; the publisher may not have set a category. |
| I was deactivated mid-session | You will see a notification; you need to be **reactivated** by an admin. |

---

## 5. Getting help

- **Access, assignments, schedule mistakes, or account status:** contact your organization’s **administrator**.
- **Login page** links such as **Contact** or **Terms** apply to your deployment’s policies.

---

## 6. Document info

- **Product:** Sportsmagician Audio — web app for managed audio streaming.
- This manual describes **intended use** of the publisher and subscriber dashboards. Hosting, Firebase rules, and org-specific settings must allow the actions you expect.

When workflows or the UI change, this file should be updated together with the app.

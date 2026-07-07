import admin from 'firebase-admin';
import { readFileSync } from 'fs';

const sa = JSON.parse(readFileSync('/var/www/spa/.env.production.service-account.json', 'utf8'));
admin.initializeApp({ credential: admin.credential.cert(sa) });
const db = admin.firestore();

async function check() {
  const usersSnap = await db.collection('users')
    .where('email', 'in', ['BRosebk@sportsmagician.com', 'sammy@sportsmagician.com'])
    .get();
  
  console.log('=== USERS ===');
  usersSnap.docs.forEach(d => {
    const data = d.data();
    console.log(d.id, '|', data.email, '| role:', data.role, '| active:', data.isActive);
  });

  const userIds = usersSnap.docs.map(d => d.id);
  console.log('\nUser IDs:', userIds);

  for (const uid of userIds) {
    const permsSnap = await db.collection('streamPermissions')
      .where('subscriberId', '==', uid)
      .where('isActive', '==', true)
      .get();
    console.log(`\n=== PERMISSIONS for ${uid} ===`);
    console.log('Count:', permsSnap.size);
    permsSnap.docs.forEach(d => {
      const data = d.data();
      console.log(' -', d.id, '| publisherId:', data.publisherId);
    });

    const assignsSnap = await db.collection('streamAssignments')
      .where('subscriberId', '==', uid)
      .where('isActive', '==', true)
      .get();
    console.log(`\n=== STREAM ASSIGNMENTS for ${uid} ===`);
    console.log('Count:', assignsSnap.size);
    assignsSnap.docs.forEach(d => {
      const data = d.data();
      console.log(' -', d.id, '| streamSessionId:', data.streamSessionId);
    });
  }

  const sessionsSnap = await db.collection('streamSessions')
    .where('isActive', '==', true)
    .get();
  console.log('\n=== ACTIVE STREAM SESSIONS ===');
  console.log('Count:', sessionsSnap.size);
  sessionsSnap.docs.forEach(d => {
    const data = d.data();
    console.log(' -', d.id, '| publisher:', data.publisherId, '| title:', data.title, '| roomId:', data.roomId, '| scheduledCallId:', data.scheduledCallId || 'none');
  });

  // Cross-reference: which publishers are live vs which publishers these subs have access to
  const livePublisherIds = new Set(sessionsSnap.docs.map(d => d.data().publisherId));
  console.log('\n=== LIVE PUBLISHER IDs ===');
  console.log([...livePublisherIds]);

  for (const uid of userIds) {
    const email = usersSnap.docs.find(d => d.id === uid)?.data()?.email;
    const permsSnap = await db.collection('streamPermissions')
      .where('subscriberId', '==', uid)
      .where('isActive', '==', true)
      .get();
    const assignedPublishers = new Set(permsSnap.docs.map(d => d.data().publisherId));
    const overlap = [...livePublisherIds].filter(pid => assignedPublishers.has(pid));
    console.log(`\n${email}: assigned to ${assignedPublishers.size} publishers, ${overlap.length} are currently live`);
    if (overlap.length === 0 && livePublisherIds.size > 0) {
      console.log('  >>> MISMATCH: subscriber has NO permissions for any live publisher!');
      console.log('  Assigned publishers:', [...assignedPublishers]);
      console.log('  Live publishers:', [...livePublisherIds]);
    }
  }
}

check().then(() => process.exit(0)).catch(e => { console.error(e); process.exit(1); });

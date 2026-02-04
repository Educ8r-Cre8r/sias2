# Firestore Security Rules for Anonymous Authentication

## Overview
The Science In A Snapshot site now uses Firebase Anonymous Authentication to properly track user ratings and prevent duplicate votes.

## Required Security Rules

You need to update your Firestore security rules in the Firebase Console to allow authenticated users (including anonymous users) to read and write data.

### How to Update Security Rules

1. Go to the Firebase Console: https://console.firebase.google.com/project/sias-8178a/firestore/rules

2. Replace the existing rules with the following:

```javascript
rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {

    // Ratings collection - aggregate photo ratings
    // Anyone can read ratings, only authenticated users can write
    match /ratings/{photoId} {
      allow read: if true;
      allow write: if request.auth != null;
    }

    // User ratings collection - individual user ratings per photo
    // Format: {userId}-{photoId}
    // Users can only write their own ratings, everyone can read
    match /userRatings/{ratingId} {
      allow read: if true;
      allow create: if request.auth != null
                   && ratingId == request.auth.uid + '-' + request.resource.data.photoId
                   && request.resource.data.userId == request.auth.uid;
      allow update, delete: if false; // Prevent rating changes
    }

    // Views collection - photo view counts
    // Anyone can read, only authenticated users can write
    match /views/{photoId} {
      allow read: if true;
      allow write: if request.auth != null;
    }

    // Test connection document (used during initialization)
    match /_test/_connection {
      allow read: if true;
    }
  }
}
```

### What These Rules Do

1. **ratings/{photoId}**: Aggregate ratings for each photo
   - Anyone can read to display ratings
   - Only authenticated users (including anonymous) can write

2. **userRatings/{userId}-{photoId}**: Individual user ratings
   - Anyone can read (for future features like "see who rated what")
   - Users can only create ratings for themselves
   - Document ID must match format: `{userId}-{photoId}`
   - Cannot update or delete ratings (prevents rating manipulation)

3. **views/{photoId}**: View counts for each photo
   - Anyone can read to display view counts
   - Only authenticated users can increment views

4. **_test/_connection**: Test document for Firebase initialization
   - Anyone can read (used to test connection during app startup)

### Security Features

✅ **Prevents duplicate ratings**: Users can only rate each photo once (enforced at database level)

✅ **Anonymous user tracking**: Each anonymous user gets a unique ID that persists across page reloads

✅ **Rating integrity**: Users cannot modify or delete their ratings after submission

✅ **User attribution**: Each rating is tied to a specific user ID

### Testing the Rules

After updating the rules:

1. Visit the site: https://educ8r-cre8r.github.io/sias2/
2. Open browser console (F12)
3. Look for: `✅ Signed in anonymously` and `✅ User authenticated: Anonymous`
4. Click a photo and try to rate it
5. Refresh the page and try to rate the same photo again
6. You should see: "You have already rated this photo!"

### Troubleshooting

**If you see "Permission denied" errors:**
- Make sure you've published the security rules in Firebase Console
- Check that the rules exactly match the format above
- Verify authentication is working (check console for user ID)

**If anonymous sign-in fails:**
- Go to Firebase Console > Authentication > Sign-in methods
- Enable "Anonymous" authentication provider
- Click "Save"

## Data Structure

### ratings collection
```javascript
{
  photoId: "1",
  totalRatings: 15,
  totalStars: 68,
  averageRating: 4.53,
  firstRated: Timestamp,
  lastRated: Timestamp
}
```

### userRatings collection
```javascript
Document ID: "{userId}-{photoId}"
{
  userId: "abc123...",
  photoId: "1",
  stars: 5,
  timestamp: Timestamp
}
```

### views collection
```javascript
{
  photoId: "1",
  count: 234,
  firstViewed: Timestamp,
  lastViewed: Timestamp
}
```

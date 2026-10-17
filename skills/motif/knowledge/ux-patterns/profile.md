# Profile

Who someone is in the app: your own details to manage, or another person's page to look at.

## Goal

- Show who someone is at a glance: picture, name and the facts that matter in this app.
- Let people manage their own details easily, and control what others see.
- Make the next step obvious: edit on your own profile, connect or message on someone else's.

## Anatomy

- **Avatar:** a photo in `radius.full`, with an initials fallback on `surface-raised` when there's no photo.
- **Name and handle:** the name in `title`, the handle or role in `text-secondary`.
- **Bio or key facts:** a short bio, location, role or member since; clamped to a few lines with "More".
- **Primary action:** on your own profile, Edit profile; on someone else's, the main way to connect (Follow, Message, Book).
- **Content:** sections or tabs of their posts, work, reviews or activity.
- **Edit form:** name, handle, bio and photo; photo upload with crop and preview; the same form rules as any other form.
- **Privacy indicator:** a clear marker of what is public and what is private ("Only you can see this").

## Required states

- **Your own vs someone else's:** different primary actions, and private details shown only to the owner.
- **Loading:** avatar and name skeletons, then content.
- **Nothing posted yet:** on your own profile, invite the first post; on someone else's, a neutral line ("No posts yet").
- **Private or blocked:** say the profile is private or unavailable, without exposing details.
- **Editing:** fields pre-filled; Save and Cancel.
- **Uploading a photo:** progress on the avatar itself; the old photo stays until the new one is ready.
- **Validation errors:** inline ("That handle is taken"), with suggestions where possible.
- **Saved:** the profile updates in place, with a brief confirmation.

## Common mistakes

- Vanity stats (followers, views) leading the page → the facts that matter in this app.
- Edit hidden in a menu → visible on your own profile.
- Uploads without crop or preview → both, before saving.
- No fallback avatar (a broken image or a generic silhouette) → initials.
- Long bios breaking the layout → clamp with "More".
- Settings mixed into the profile → link to settings instead.
- Private details visible to others by default → private by default, with a clear choice to share.

## Mobile and web

- **Mobile:** a header with the avatar, name and an action row (Edit or Follow and Message), then tabbed content below; editing on its own screen; the camera and photo library offered for the avatar.
- **Web:** a wider header, then two columns on wide screens (about on one side, content on the other); editing in place or in a dialog; drag and drop for the photo, as well as a button.
- **Both:** the avatar and name are the same everywhere they appear (comments, lists, headers), so people recognise each other.

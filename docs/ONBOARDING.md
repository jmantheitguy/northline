# Northline member onboarding

1. An Authentik administrator creates the member and assigns **Domain Users** plus **Northline Users**. Administrators also receive **Northline Admins**.
2. The member signs in to Authentik with their office username/password and completes account recovery information.
3. In Authentik profile settings, the member optionally links Discord. Northline uses that link only for the member's profile picture and private Task Buddy reminder delivery; Discord is not a Northline sign-in method and the office email plus Authentik identity remain authoritative.
4. The member signs in at the Northline URL through Authentik. Northline reconciles the linked Discord profile during this first sign-in if Authentik did not retain the source attributes when Discord was connected.
5. A board owner shares the appropriate boards as viewer or editor.
6. The member chooses personal Task Buddy preferences in Northline Settings.
7. The member opens a shared board, confirms their viewer/editor permission, and tests global search.
8. The member chooses light or dark mode. Northline initially follows the device preference and then remembers the browser-specific selection.

## Administrator onboarding

Administrators should verify access to **Administration**, review users and boards, open **Health**, and send a Task Buddy test message. They should not share the local recovery administrator or infrastructure credentials with ordinary Northline administrators.

## Board permissions

- **Owner:** edit the board, manage tasks, share access, configure Task Buddy, and delete the board.
- **Editor:** create, edit, duplicate, move, and delete tasks; schedule reminders; view activity.
- **Viewer:** read the board, tasks, comments, and activity without mutations.
- **Admin:** workspace-wide oversight and access to the administration area.

Removing **Northline Users** or suspending the Authentik account revokes Northline access during directory synchronization.

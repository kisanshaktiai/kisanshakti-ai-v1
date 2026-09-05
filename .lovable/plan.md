# Solid, Consistent Toast Notifications

## Goal
Make every notification fully opaque, readable, and consistently positioned across the app while preserving the existing KisanShakti theme.

## Confirmed findings
- The screenshot’s green schedule-deletion toast is transparent because its caller overrides the toast surface with `bg-success/10`.
- The schedule page and notification settings contain additional success/accent toast overrides using 10% opacity.
- The app mounts both the Radix/shadcn toaster and Sonner, and they currently use separate visual rules.
- The fixed app header is 56px tall; toast placement must include the header and safe-area offset so notifications do not sit behind the logo or controls.

## Changes
1. **Create one opaque toast appearance**
   - Give default, success/accent, and error notifications solid semantic backgrounds with high-contrast text, borders, icons, and shadows.
   - Apply equivalent styling to both existing toast systems so notifications look the same regardless of which API triggers them.

2. **Remove transparent call-site overrides**
   - Replace the confirmed `bg-success/10` and `bg-accent/10` overrides in schedule and notification flows with solid semantic variants/classes.
   - Search all toast calls and remove any other translucent background override without changing their messages or behavior.

3. **Correct mobile placement**
   - Position both toast systems below the fixed 56px header plus the device safe area.
   - Constrain width and side spacing for the 393px mobile screen, while retaining appropriate desktop placement.
   - Ensure stacked notifications stay above page content and do not collide with the top branding or bottom navigation.

4. **Verify all states**
   - Check success, error, and standard notifications on the schedule screen at the supplied mobile viewport.
   - Confirm computed backgrounds are opaque, text remains readable, close/actions remain usable, and notifications do not cover the logo.

## Scope
Frontend toast presentation and existing toast call-site classes only. No message wording, schedule logic, database, or edge-function changes.

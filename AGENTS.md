# Repository agent instructions

When publishing or updating a pull request, monitor its required CI checks after
the push. Do not report the publishing task as complete until the checks pass.
If a check fails, inspect its logs, fix failures caused by the pull request,
push the correction, and monitor the replacement run until it reaches a
terminal state.

All new or changed user-facing features must support both English and Swedish.
Put user-facing copy in the shared locale catalogs and use the localization
helpers; do not add literal English or Swedish UI labels and descriptions.

All create and edit flows must open on a dedicated, clean page. Do not place
create or edit forms inline on a list or management page.

Never use browser-native alert, confirm, or prompt dialogs for user-facing
messages or confirmations. Use the portal's styled modal and notice patterns,
with all copy provided through the shared locale catalogs.

Keep repeated controls and interaction patterns visually consistent across the
portal. Reuse shared components and the established icon-button patterns for
actions such as viewing, downloading, editing, and removing files instead of
introducing section-specific text controls.

Always leave a visible space between a checkbox and its label. Wrap the
checkbox and its text in a `label.checkbox-row`, which provides the gap,
instead of placing the input and text side by side without spacing. Put
explanations of a checkbox or field in an `InfoTip` ("i" icon shown on hover)
rather than in extra help text under the label.

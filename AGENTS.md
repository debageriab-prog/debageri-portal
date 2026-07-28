# Repository agent instructions

When publishing or updating a pull request, monitor its required CI checks after
the push. Do not report the publishing task as complete until the checks pass.
If a check fails, inspect its logs, fix failures caused by the pull request,
push the correction, and monitor the replacement run until it reaches a
terminal state.

All new or changed user-facing features must support both English and Swedish.
Put user-facing copy in the shared locale catalogs and use the localization
helpers; do not add literal English or Swedish UI labels and descriptions.

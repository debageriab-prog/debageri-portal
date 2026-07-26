# Repository agent instructions

When publishing or updating a pull request, monitor its required CI checks after
the push. Do not report the publishing task as complete until the checks pass.
If a check fails, inspect its logs, fix failures caused by the pull request,
push the correction, and monitor the replacement run until it reaches a
terminal state.

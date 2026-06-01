#!/bin/bash
source ~/.zshenv 2>/dev/null
exec npx @sentry/mcp-server --access-token "$SENTRY_ACCESS_TOKEN" --organization-slug s-3j --project-slug scout-360

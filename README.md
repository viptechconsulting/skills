# skills

## WordPress MCP

This repo is configured (`.mcp.json`) to connect Claude Code to the WordPress
site at https://clogmasters.com/ via [wordpress-mcp](https://github.com/Automattic/wordpress-mcp)
(through the [mcp-wordpress-remote](https://github.com/Automattic/mcp-wordpress-remote) proxy),
using WordPress Application Password auth (user `vip-support`).

The password is **not** stored in this repo. Before starting Claude Code, export it
in your shell:

```bash
export WP_API_PASSWORD="xxxx xxxx xxxx xxxx xxxx xxxx"
```

Requirements on the WordPress side: the `wordpress-mcp` plugin must be installed and
active on the site, and the application password above must exist under
`Users > Profile > Application Passwords` for the `vip-support` user.
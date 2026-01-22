# Netlify Environment Variables Setup

## SSH Terminal Configuration for Netlify Frontend

### Required Environment Variables

Set these variables in **Netlify Dashboard** → **Site settings** → **Build & deploy** → **Environment**:

| Variable Name | Value | Description |
|--------------|-------|-------------|
| `NEXT_PUBLIC_API_URL` | `http://100.48.93.18:3000` | AWS Backend API URL (public, used by browser) |
| `REACT_APP_API_URL` | `http://100.48.93.18:3000` | React app API URL (for compatibility) |
| `APP_USERNAME` | `aixsystem` | SSH terminal login username |
| `APP_PASSWORD` | `nemesisN3M3616` | SSH terminal login password |
| `AWS_REGION` | `us-east-1` | AWS region |
| `NODE_VERSION` | `18.17.0` | Node.js version for build |

### How It Works

```
1. User opens Netlify frontend (static HTML/JS)
2. User enters credentials in login form:
   - Username: aixsystem
   - Password: nemesisN3M3616
3. Frontend sends login request to AWS backend:
   - POST http://100.48.93.18:3000/api/auth/login
4. Backend validates credentials from APP_USERNAME and APP_PASSWORD
5. Backend returns JWT token
6. Frontend connects to SSH terminal:
   - WebSocket: ws://100.48.93.18:3000/api/terminal
   - Sends JWT token in Authorization header
7. Backend opens SSH connection to Ubuntu machine using a.pem
8. Terminal works bidirectionally
```

### Build Configuration

```toml
# netlify.toml - Already configured
[build]
  command = "npm run build:netlify"
  publish = "out"
  environment = { NODE_VERSION = "18.17.0" }

[[redirects]]
  from = "/api/*"
  to = "http://100.48.93.18:3000/api/:splat"
  status = 200
  force = true
```

### AWS Backend Requirements

The AWS backend (running on 100.48.93.18:3000) needs:
- ✅ a.pem (SSH private key) - stored locally on EC2 instance
- ✅ AWS credentials configured for DynamoDB access
- ✅ PM2 running the Node.js backend process
- ✅ APP_USERNAME and APP_PASSWORD environment variables

### Verification Steps

1. Check AWS backend is running:
   ```bash
   ssh -i a.pem ubuntu@100.48.93.18 "pm2 status"
   ```

2. Test authentication endpoint:
   ```bash
   curl -X POST http://100.48.93.18:3000/api/auth/login \
     -H "Content-Type: application/json" \
     -d '{"username":"aixsystem","password":"nemesisN3M3616"}'
   ```

3. Access Netlify frontend and login with:
   - Username: `aixsystem`
   - Password: `nemesisN3M3616`

### No Additional Keys Needed for Netlify

Netlify frontend does NOT need:
- ❌ a.pem (SSH key) - used only by backend
- ❌ AWS access keys - used only by backend
- ❌ AWS secret keys - used only by backend

All credentials are handled by the AWS backend, not the frontend!

---
**Last updated:** 2026-01-22  
**Status:** Ready for deployment ✅

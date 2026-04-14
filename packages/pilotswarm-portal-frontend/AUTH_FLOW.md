# PilotSwarm Authentication Flow

## Overview

The frontend now has a complete authentication system with:
- ✅ Home page (public)
- ✅ Email/Password login and signup
- ✅ Google OAuth integration
- ✅ Microsoft OAuth integration
- ✅ Protected app routes

## User Journey

```
HOME PAGE (/) - Public Landing Page
    ↓
    ├─→ "Sign In" button → LOGIN PAGE (/login)
    │                        ├─ Email/Password Login
    │                        ├─ Google OAuth
    │                        └─ Microsoft OAuth
    │
    └─→ "Create Account" → SIGNUP PAGE (/signup)
                             ├─ Email/Password Signup
                             ├─ Google OAuth
                             └─ Microsoft OAuth
         ↓
      APP (/app/*) - Protected Routes
         └─ Requires Authentication
```

## Authentication Methods

### 1. Email/Password
- **Login**: Email + Password
- **Signup**: Name + Email + Password + Confirm Password
- Token stored in localStorage
- Mock implementation (ready for backend integration)

### 2. OAuth (Google & Microsoft)

#### Flow:
1. User clicks "Sign in with [Provider]"
2. Redirected to OAuth provider (Google/Microsoft)
3. User authorizes the app
4. Provider redirects back with `code` and `state`
5. Frontend processes callback
6. Token is stored in localStorage
7. User is logged in

#### OAuth Providers:
- **Microsoft**: Uses PKCE flow with Azure AD
- **Google**: Uses PKCE flow with Google OAuth 2.0

## Files & Components

### Created Files:
```
src/
├── components/
│   ├── auth/
│   │   ├── LoginPage.tsx           # Login UI (email/OAuth)
│   │   ├── LoginPage.module.css    # Shared auth styles
│   │   └── SignupPage.tsx          # Signup UI (email/OAuth)
│   └── home/
│       ├── HomePage.tsx             # Landing page
│       └── HomePage.module.css      # Landing page styles
├── hooks/
│   └── AuthContext.tsx              # Auth state management
└── lib/
    └── auth.ts                      # Auth utilities & OAuth flows
```

### Modified Files:
```
src/
├── App.tsx                          # Routing with protected routes
└── components/layout/
    └── Sidebar.tsx                  # Added logout button
```

## Configuration

### Environment Variables
Currently using local frontend. When connecting to backend:

```
VITE_PORTAL_API_BASE_URL=http://localhost:3001
VITE_PORTAL_WS_URL=ws://localhost:3001
```

### Backend Requirements (for OAuth)

When you connect the local backend, set these env vars:

```bash
# Microsoft OAuth (Optional)
ENTRA_TENANT_ID=your_tenant_id
ENTRA_CLIENT_ID=your_client_id

# Google OAuth (Optional)
GOOGLE_CLIENT_ID=your_client_id

# Database
DATABASE_URL=postgresql://...
```

## Token Management

- **Storage**: localStorage
- **Key**: `pilotswarm_access_token`
- **Passed to API**: Authorization header `Bearer {token}`
- **Cleared on**: Logout or 401 response

## Testing Guide

### 1. Home Page
```bash
npm run dev
# Visit http://localhost:5173
# Should see welcome message and "Sign In" / "Create Account" buttons
```

### 2. Email Login/Signup
```bash
# Login with any email/password
# Or Signup with name, email, password
# Should redirect to /app
```

### 3. OAuth (when backend is ready)
```bash
# Set backend URL:
VITE_PORTAL_API_BASE_URL=http://localhost:3001

# Click OAuth button → Authorize → Should redirect to /app
```

### 4. Protected Routes
```bash
# Try visiting /app without logging in
# Should redirect to /login
```

### 5. Logout
```bash
# Click "Sign Out" in sidebar
# Should redirect to home page
# Token cleared from localStorage
```

## Backend Integration Checklist

- [ ] Deploy backend portal server with auth configured
- [ ] Set VITE_PORTAL_API_BASE_URL to backend URL
- [ ] Verify `/api/auth-config` endpoint returns auth providers
- [ ] Verify `/api/bootstrap` requires Bearer token
- [ ] (Optional) Create `/api/oauth-callback` for token exchange
- [ ] (Optional) Create `/api/user` to fetch user info
- [ ] Test OAuth login flow end-to-end
- [ ] Test protected routes with token

## Current Limitations

1. **Email/Password**: Mock implementation (no backend validation)
   - Replace in `src/components/auth/LoginPage.tsx` and `SignupPage.tsx`
   
2. **User Info**: Basic user object created from OAuth response
   - Will be fetched from backend via `/api/user` endpoint when available

3. **OAuth Callback**: Falls back to using code as token
   - Works with backend that validates codes directly
   - Can use `/api/oauth-callback` endpoint for proper token exchange

## Next Steps

1. ✅ Frontend auth UI complete
2. ⏳ Connect to local backend
3. ⏳ Configure OAuth providers (Microsoft/Google)
4. ⏳ Create backend endpoints if needed:
   - POST `/api/oauth-callback` (optional)
   - GET `/api/user` (optional)

---

**Last Updated**: 2024-04-13

"""
Security Headers & Defense-in-Depth Middleware for CampusVote.
Enforces OWASP-recommended HTTP security response headers across all API and document views.
"""

class SecurityHeadersMiddleware:
    """
    Appends strict security headers to all HTTP responses:
    - X-Content-Type-Options: nosniff
    - X-Frame-Options: DENY
    - Referrer-Policy: strict-origin-when-cross-origin
    - Permissions-Policy: camera=(), microphone=(), geolocation=(), payment=()
    - Content-Security-Policy (CSP)
    """

    def __init__(self, get_response):
        self.get_response = get_response

    def __call__(self, request):
        response = self.get_response(request)

        # Anti-MIME sniffing
        response.headers['X-Content-Type-Options'] = 'nosniff'

        # Clickjacking mitigation
        response.headers['X-Frame-Options'] = 'DENY'

        # Referrer privacy
        response.headers['Referrer-Policy'] = 'strict-origin-when-cross-origin'

        # Hardware and API feature restriction
        response.headers['Permissions-Policy'] = 'geolocation=(), microphone=(), camera=(), payment=()'

        # Content Security Policy (strict defaults, allowing self, inline styles for Tailwind, and ws/wss for channels)
        if 'Content-Security-Policy' not in response.headers:
            import os
            extra_connect = os.getenv('CSP_EXTRA_CONNECT_SRC', '').strip()
            connect_directive = "connect-src 'self' ws: wss: http://127.0.0.1:* http://localhost:*"
            if extra_connect:
                connect_directive = f"{connect_directive} {extra_connect}"

            csp_directives = [
                "default-src 'self'",
                "script-src 'self' 'unsafe-inline'",
                "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
                "font-src 'self' https://fonts.gstatic.com data:",
                "img-src 'self' data: https:",
                connect_directive,
                "frame-ancestors 'none'",
                "object-src 'none'",
                "base-uri 'self'",
                "form-action 'self'",
            ]
            response.headers['Content-Security-Policy'] = "; ".join(csp_directives)

        return response

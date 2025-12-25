\# SecureWeb - Privacy Access Management System



SecureWeb is a Chromium-based browser extension that enforces a \*\*Zero-Trust privacy model\*\* for web browsing. It detects malicious JavaScript, blocks unauthorized device access (camera, mic, location), prevents suspicious auto-downloads, cloaks fingerprinting behaviors, and warns users when entering sensitive data on risky pages.



\## Key Features



\- \*\*Malicious Script Detection\*\*  

&nbsp; - Detects dangerous patterns like `eval()` and `new Function()`  

&nbsp; - Logs dynamically injected scripts



\- \*\*Phishing \& Sensitive Form Detection\*\*  

&nbsp; - Identifies forms that submit to a different origin  

&nbsp; - Flags forms with password, OTP, card, or bank fields



\- \*\*Zero-Trust Permission Control\*\*  

&nbsp; - Blocks camera/mic/geolocation by default  

&nbsp; - Per-site whitelist and temporary allow  

&nbsp; - Role-based logic:

&nbsp;   - Guest: strict, most restrictive  

&nbsp;   - User: normal security  

&nbsp;   - Admin: more permissive but only after MFA (PIN demo)



\- \*\*Download Protection\*\*  

&nbsp; - Blocks suspicious downloads from untrusted origins  

&nbsp; - Maintains a list of blocked downloads with manual “Allow” option



\- \*\*Per-Site Risk Scoring\*\*  

&nbsp; - Each origin gets a score and label: Low / Medium / High  

&nbsp; - Based on suspicious scripts, phishing forms, and blocked downloads  

&nbsp; - Risk badge visible in popup and optionally on extension icon



\- \*\*Clipboard Protection\*\*  

&nbsp; - Optional toggle to monitor paste events into sensitive fields



\- \*\*Modes: Normal, Work, Safe\*\*  

&nbsp; - Work Mode: warns on social/gaming sites  

&nbsp; - Safe Mode: stricter warnings (especially for adult domains)



\- \*\*Behavior Profiling (Local Only)\*\*  

&nbsp; - Typing rhythm and mouse movement anomaly detection (for research)



\- \*\*Self-Destruct Session\*\*  

&nbsp; - Clears temporary site permissions and admin MFA  

&nbsp; - Does \*\*not\*\* delete logs (for analysis)



\- \*\*Stats \& Logs\*\*  

&nbsp; - Daily stats: threats, downloads, permissions blocked/allowed  

&nbsp; - Export logs as JSON



\## File Structure



```text

SecureWebExtension/

├─ manifest.json

├─ background.js

├─ content.js

├─ content\_protector.js

├─ behavior.js

├─ popup.html

├─ popup.js

├─ vault.js

└─ icons/

&nbsp;  ├─ icon16.png

&nbsp;  ├─ icon32.png

&nbsp;  ├─ icon48.png

&nbsp;  └─ icon128.png




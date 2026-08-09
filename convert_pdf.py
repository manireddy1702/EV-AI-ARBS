import subprocess
import os

html_path = r"c:\Users\manir\OneDrive\Desktop\major pjt\AI_Model_Evaluation_Report.html"
pdf_path = r"c:\Users\manir\OneDrive\Desktop\major pjt\AI_Model_Evaluation_Report.pdf"

browser_paths = [
    r"C:\Program Files (x86)\Microsoft\Edge\Application\msedge.exe",
    r"C:\Program Files\Microsoft\Edge\Application\msedge.exe",
    r"C:\Program Files\Google\Chrome\Application\chrome.exe",
    r"C:\Program Files (x86)\Google\Chrome\Application\chrome.exe"
]

browser_exe = None
for bp in browser_paths:
    if os.path.exists(bp):
        browser_exe = bp
        break

if browser_exe:
    cmd = [
        browser_exe,
        "--headless",
        "--disable-gpu",
        f"--print-to-pdf={pdf_path}",
        "--no-pdf-header-footer",
        html_path
    ]
    print(f"Running command with {browser_exe}...")
    res = subprocess.run(cmd, capture_output=True, text=True)
    if os.path.exists(pdf_path):
        print(f"SUCCESS: PDF generated successfully at:\n{pdf_path}")
    else:
        print(f"Error: {res.stderr}")
else:
    print("Could not locate Edge or Chrome browser executable.")

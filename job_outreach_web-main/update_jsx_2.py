import re

with open('app/dashboard/page.tsx', 'r', encoding='utf-8') as f:
    content = f.read()

# Remove marked from imports
content = content.replace("import { marked } from 'marked';\n", "")

# Replace marked.parse with just finalBody
content = content.replace("await marked.parse(finalBody)", "finalBody")

# Update instructions
content = content.replace(
    '"Use bold text strategically for key metrics, tools, or high-signal achievements so the email is easy to scan."',
    '"Use standard HTML tags for formatting (e.g., <b> for bold, <br> for newlines, <ul><li> for bullet points). Do not use markdown."'
)

with open('app/dashboard/page.tsx', 'w', encoding='utf-8') as f:
    f.write(content)

print("Updated page.tsx successfully.")

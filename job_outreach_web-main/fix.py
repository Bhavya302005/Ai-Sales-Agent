with open('app/dashboard/tabs/SettingsTab.tsx', 'r', encoding='utf-8') as f:
    lines = f.readlines()

new_lines = []
for line in lines:
    if '{/* Column 2: Defaults & Limits */}' in line:
        break
    new_lines.append(line)

new_lines.append('    {/* Column 2: Defaults & Limits */}\n')
new_lines.append('    <div className="space-y-stack-md">\n')
new_lines.append('      <div className="bg-surface-container border border-outline-variant rounded-xl p-stack-md glass-card flex flex-col justify-between h-full">\n')
new_lines.append('        <div>\n')
new_lines.append('          <h3 className="font-headline-sm text-headline-sm text-on-surface mb-3 flex items-center gap-2">\n')
new_lines.append('            <span className="material-symbols-outlined text-primary">security</span>\n')
new_lines.append('            Safety & AI Defaults\n')
new_lines.append('          </h3>\n')
new_lines.append('          <p className="text-on-surface-variant font-body-sm mb-4">Manage outreach models and throttle applications to safe hourly limits.</p>\n')
new_lines.append('\n')
new_lines.append('          <div className="space-y-4">\n')
new_lines.append('            {/* Default AI Model dropdown */}\n')
new_lines.append('            <div>\n')
new_lines.append('              <label className="block text-label-md text-on-surface font-semibold mb-2">Default AI Model</label>\n')
new_lines.append('              <select\n')
new_lines.append('                value={defaultAiModel}\n')
new_lines.append('                onChange={(e) => setDefaultAiModel(e.target.value)}\n')
new_lines.append('                className="w-full px-4 py-2 rounded-lg border border-outline-variant bg-surface-container-low text-on-surface focus:outline-none focus:border-primary transition-all font-body-md"\n')
new_lines.append('              >\n')
new_lines.append('                <option value="gemini">Google Gemini 2.5 Flash</option>\n')
new_lines.append('                <option value="claude">Anthropic Claude 3.5 Sonnet</option>\n')
new_lines.append('              </select>\n')
new_lines.append('            </div>\n')
new_lines.append('\n')
new_lines.append('            {/* Daily application safety limit slider */}\n')
new_lines.append('            <div>\n')
new_lines.append('              <div className="flex justify-between items-center mb-2">\n')
new_lines.append('                <label className="text-label-md text-on-surface font-semibold">Daily Application Limit</label>\n')
new_lines.append('                <span className="text-primary font-bold text-sm bg-primary/10 px-2 py-0.5 rounded-full">{dailyLimit} emails</span>\n')
new_lines.append('              </div>\n')
new_lines.append('              <input\n')
new_lines.append('                type="range"\n')
new_lines.append('                min="10"\n')
new_lines.append('                max="200"\n')
new_lines.append('                step="5"\n')
new_lines.append('                value={dailyLimit}\n')
new_lines.append('                onChange={(e) => setDailyLimit(parseInt(e.target.value, 10))}\n')
new_lines.append('                className="w-full h-2 rounded-lg appearance-none cursor-pointer bg-outline-variant accent-primary focus:outline-none"\n')
new_lines.append('              />\n')
new_lines.append('              <p className="text-[11px] text-on-surface-variant mt-1">Recommended safe ceiling is 50-80 emails/day to safeguard your personal Gmail account.</p>\n')
new_lines.append('            </div>\n')
new_lines.append('          </div>\n')
new_lines.append('        </div>\n')
new_lines.append('      </div>\n')
new_lines.append('    </div>\n')
new_lines.append('\n')
new_lines.append('  </div>\n')
new_lines.append('\n')
new_lines.append('  {/* Row 2: Dynamic Outreach Signature Editor */}\n')

skip = True
for line in lines:
    if '{/* Row 2: Dynamic Outreach Signature Editor */}' in line:
        skip = False
        continue
    if not skip:
        new_lines.append(line)

with open('app/dashboard/tabs/SettingsTab.tsx', 'w', encoding='utf-8') as f:
    f.writelines(new_lines)
print('Restored successfully')

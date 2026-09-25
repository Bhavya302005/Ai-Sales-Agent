import re

with open('app/dashboard/page.tsx', 'r', encoding='utf-8') as f:
    content = f.read()

match = re.search(r'(\s*return\s*\(\s*)<div className="bg-background', content)
if not match:
    match = re.search(r'(\s*return\s*\(\s*)<div className="container">', content)
    
if not match:
    print("Could not find return statement")
    exit(1)

start_idx = match.start(1)

new_jsx = """
  return (
    <div className="bg-surface text-on-surface font-body-md min-h-screen overflow-x-hidden">
      
      {/* Top Navigation Bar (Mobile only) */}
      <header className="flex justify-between items-center px-container-padding-mobile h-16 w-full z-40 bg-surface border-b border-outline-variant sticky top-0 lg:hidden">
        <div className="flex items-center gap-3">
          <span className="material-symbols-outlined text-primary">menu</span>
          <span className="font-headline-md text-headline-md font-bold text-primary">AI Job Mailer</span>
        </div>
        <div className="w-8 h-8 rounded-full overflow-hidden border border-outline bg-primary-container flex items-center justify-center font-bold text-primary">
          {user ? user.email[0].toUpperCase() : 'U'}
        </div>
      </header>

      <div className="flex min-h-screen">
        {/* Desktop Navigation Drawer */}
        <aside className="hidden lg:flex flex-col h-screen py-stack-lg w-80 fixed left-0 top-0 bg-surface-container shadow-lg z-50">
          <div className="px-6 mb-stack-lg flex flex-col items-start">
            <h1 className="font-headline-md text-headline-md font-bold text-primary mb-stack-md">AI Job Mailer</h1>
            {user && (
              <div className="flex items-center gap-3 bg-surface-container-highest/30 p-3 rounded-xl w-full">
                <div className="w-10 h-10 rounded-full border border-outline bg-primary flex items-center justify-center font-bold text-on-primary">
                  {user.email[0].toUpperCase()}
                </div>
                <div className="overflow-hidden flex-1">
                  <p className="font-body-md text-body-md text-on-surface font-semibold truncate">{user.email}</p>
                  <div className="flex items-center justify-between mt-1">
                    <div className="flex items-center gap-1">
                      <span className="w-2 h-2 bg-primary rounded-full"></span>
                      <p className="font-label-md text-label-md text-on-surface-variant">Active</p>
                    </div>
                    <button className="font-label-md text-label-md text-primary hover:underline" onClick={handleSignOut}>Sign Out</button>
                  </div>
                </div>
              </div>
            )}
          </div>
          
          <nav className="flex-1 flex flex-col gap-1 px-2">
            <button onClick={() => setActiveTab('home')} className={`px-4 py-3 mx-2 flex items-center gap-3 rounded-full transition-all duration-300 ease-in-out ${activeTab === 'home' ? 'bg-secondary-container text-on-secondary-container' : 'text-on-surface-variant hover:bg-surface-container-highest'}`}>
              <span className="material-symbols-outlined">dashboard</span>
              <span className="font-body-md text-body-md">Dashboard</span>
            </button>
            <button onClick={() => setActiveTab('auto')} className={`px-4 py-3 mx-2 flex items-center gap-3 rounded-full transition-all duration-300 ease-in-out ${activeTab === 'auto' ? 'bg-secondary-container text-on-secondary-container' : 'text-on-surface-variant hover:bg-surface-container-highest'}`}>
              <span className="material-symbols-outlined">smart_toy</span>
              <span className="font-body-md text-body-md">Auto Agent</span>
            </button>
            <button onClick={() => setActiveTab('outreach')} className={`px-4 py-3 mx-2 flex items-center gap-3 rounded-full transition-all duration-300 ease-in-out ${activeTab === 'outreach' ? 'bg-secondary-container text-on-secondary-container' : 'text-on-surface-variant hover:bg-surface-container-highest'}`}>
              <span className="material-symbols-outlined">send</span>
              <span className="font-body-md text-body-md">Outreach Hub</span>
            </button>
            <button onClick={() => setActiveTab('inbox')} className={`px-4 py-3 mx-2 flex items-center gap-3 rounded-full transition-all duration-300 ease-in-out ${activeTab === 'inbox' ? 'bg-secondary-container text-on-secondary-container' : 'text-on-surface-variant hover:bg-surface-container-highest'}`}>
              <span className="material-symbols-outlined">move_to_inbox</span>
              <span className="font-body-md text-body-md">Reply Scanner</span>
            </button>
            <button onClick={() => setActiveTab('resume')} className={`px-4 py-3 mx-2 flex items-center gap-3 rounded-full transition-all duration-300 ease-in-out ${activeTab === 'resume' ? 'bg-secondary-container text-on-secondary-container' : 'text-on-surface-variant hover:bg-surface-container-highest'}`}>
              <span className="material-symbols-outlined">description</span>
              <span className="font-body-md text-body-md">Resume Manager</span>
            </button>
          </nav>
        </aside>

        {/* Main Content Area */}
        <main className="flex-1 lg:ml-80 pb-32 lg:pb-12">
          
          {/* HOME / DASHBOARD TAB */}
          {(!activeTab || activeTab === 'home') && (
            <div className="max-w-6xl mx-auto px-container-padding-mobile lg:px-container-padding-desktop pt-stack-lg space-y-stack-lg">
              <section className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-2 gap-gutter">
                <div className="bg-surface-container border border-outline-variant p-stack-md rounded-xl flex flex-col justify-between glass-card">
                  <div>
                    <p className="font-label-md text-label-md text-on-surface-variant mb-1">Emails Sent</p>
                    <h2 className="font-headline-md text-headline-md font-bold">{emailHistory.length}</h2>
                  </div>
                  <div className="flex items-center gap-1 text-primary mt-2">
                    <span className="material-symbols-outlined text-[16px]">trending_up</span>
                    <span className="text-xs font-bold">Active</span>
                  </div>
                </div>
                <div className="bg-surface-container border border-outline-variant p-stack-md rounded-xl flex flex-col justify-between glass-card">
                  <div>
                    <p className="font-label-md text-label-md text-on-surface-variant mb-1">Replies Received</p>
                    <h2 className="font-headline-md text-headline-md font-bold">{scannedReplies.length}</h2>
                  </div>
                  <div className="flex items-center gap-1 text-emerald-400 mt-2">
                    <span className="material-symbols-outlined text-[16px]">chat</span>
                    <span className="text-xs font-bold">Inbox</span>
                  </div>
                </div>
                <div className="bg-surface-container border border-secondary border-l-4 p-stack-md rounded-xl col-span-1 md:col-span-2 flex items-center justify-between glass-card">
                  <div className="flex items-center gap-4">
                    <div className="w-12 h-12 rounded-full bg-gradient-to-br from-primary to-secondary flex items-center justify-center">
                      <span className="material-symbols-outlined text-surface-container-lowest">calendar_today</span>
                    </div>
                    <div>
                      <p className="font-label-md text-label-md text-on-surface-variant">Interviews Scheduled</p>
                      <h2 className="font-headline-md text-headline-md font-bold">
                        {scannedReplies.filter(r => r.classification === 'interview' || r.category === 'interview').length}
                      </h2>
                    </div>
                  </div>
                  <div className="w-12 h-12 relative flex items-center justify-center">
                    <div className="absolute inset-0 rounded-full border-4 border-secondary border-t-transparent animate-pulse"></div>
                    <span className="text-[10px] font-bold text-secondary">PULSE</span>
                  </div>
                </div>
              </section>

              <section className="bg-surface-container border border-outline-variant p-stack-md rounded-xl glass-card">
                <div className="flex justify-between items-center mb-6">
                  <h3 className="font-headline-md text-headline-md text-on-surface">Outreach Performance</h3>
                  <span className="text-xs text-on-surface-variant">Last 7 Days</span>
                </div>
                <div className="h-40 w-full relative flex items-end justify-between gap-1">
                  <div className="w-full h-32 bg-gradient-to-t from-primary/20 to-transparent rounded-t-sm flex items-end justify-around px-2">
                    <div className="w-2 h-1/2 bg-primary rounded-t-full opacity-50"></div>
                    <div className="w-2 h-2/3 bg-primary rounded-t-full opacity-50"></div>
                    <div className="w-2 h-1/3 bg-primary rounded-t-full opacity-50"></div>
                    <div className="w-2 h-3/4 bg-primary rounded-t-full opacity-50"></div>
                    <div className="w-2 h-1/2 bg-primary rounded-t-full opacity-50"></div>
                    <div className="w-2 h-5/6 bg-primary rounded-t-full opacity-50"></div>
                    <div className="w-2 h-4/5 bg-primary rounded-t-full opacity-50"></div>
                  </div>
                </div>
              </section>
            </div>
          )}

          {/* AUTO AGENT TAB */}
          {activeTab === 'auto' && (
            <div className="max-w-6xl mx-auto px-container-padding-mobile lg:px-container-padding-desktop pt-stack-lg space-y-stack-lg">
              <section className="bg-surface-container border border-outline-variant rounded-xl p-stack-lg flex flex-col gap-6 glass-card">
                <div className="flex flex-col gap-2">
                  <h2 className="font-headline-lg text-headline-lg text-on-surface">Source New Talent</h2>
                  <p className="font-body-md text-on-surface-variant">Define your target role and let the AI agent identify high-quality leads.</p>
                </div>
                <div className="flex flex-col md:flex-row gap-4">
                  <div className="flex-1 relative group rounded-lg bg-surface-container-lowest border border-outline-variant focus-within:border-primary focus-within:shadow-[0_0_15px_rgba(192,193,255,0.2)] transition-all">
                    <span className="material-symbols-outlined absolute left-4 top-1/2 -translate-y-1/2 text-on-surface-variant">search</span>
                    <input 
                      type="text"
                      className="w-full bg-transparent border-none py-4 pl-12 pr-4 text-on-surface focus:ring-0 placeholder:text-outline" 
                      placeholder="Target Job Title (e.g., 'AI Engineer')"
                      value={autoTargetTitle} 
                      onChange={e => setAutoTargetTitle(e.target.value)} 
                      onKeyDown={e => e.key === 'Enter' && handleFetchLeads()}
                    />
                  </div>
                  <button 
                    className="bg-gradient-to-r from-primary to-secondary text-surface-container-lowest px-8 py-4 rounded-lg font-bold flex items-center justify-center gap-2 hover:opacity-90 active:scale-95 duration-150 transition-all shadow-[0_0_15px_rgba(192,193,255,0.3)]"
                    onClick={handleFetchLeads}
                    disabled={isFetchingLeads}
                  >
                    {isFetchingLeads ? <div className="spinner" style={{ marginRight: '8px' }}></div> : <span className="material-symbols-outlined">auto_awesome</span>}
                    {isFetchingLeads ? "Searching..." : "Fetch Leads"}
                  </button>
                </div>
              </section>

              {autoLeads.length > 0 && (
                <>
                  <div className="flex flex-col md:flex-row justify-between items-center gap-4">
                    <div className="flex items-center gap-3">
                      <span className="material-symbols-outlined text-primary">filter_list</span>
                      <span className="font-label-md text-label-md text-on-surface-variant uppercase tracking-wider">Candidate Pipeline ({selectedLeads.size} Selected)</span>
                    </div>
                    <div className="flex items-center gap-3 w-full md:w-auto">
                      <button 
                        className="flex-1 md:flex-none px-4 py-2 rounded-lg border border-outline-variant text-on-surface hover:bg-surface-container-highest transition-colors flex items-center justify-center gap-2 font-label-md text-label-md"
                        onClick={handleTransferAutoToCsv}
                      >
                        <span className="material-symbols-outlined">person</span> Send Individually
                      </button>
                      <button 
                        className="flex-1 md:flex-none px-4 py-2 rounded-lg bg-secondary-container text-on-secondary-container hover:opacity-90 transition-opacity flex items-center justify-center gap-2 font-label-md text-label-md"
                        onClick={handleTransferAutoToBcc}
                      >
                        <span className="material-symbols-outlined">alternate_email</span> Send via Bulk BCC
                      </button>
                    </div>
                  </div>

                  <div className="bg-surface-container border border-outline-variant rounded-xl overflow-hidden glass-card">
                    <div className="overflow-x-auto" style={{maxHeight: '500px'}}>
                      <table className="w-full text-left border-collapse">
                        <thead className="sticky top-0 bg-surface-container-high/90 backdrop-blur-sm border-b border-outline-variant z-10">
                          <tr>
                            <th className="p-4 w-12 text-center">
                              <input 
                                type="checkbox" 
                                className="rounded border-outline-variant bg-surface-container text-primary focus:ring-primary/20 cursor-pointer"
                                checked={selectedLeads.size === autoLeads.length && autoLeads.length > 0}
                                onChange={(e) => {
                                  if (e.target.checked) setSelectedLeads(new Set(autoLeads.map(l => l.email)));
                                  else setSelectedLeads(new Set());
                                }}
                              />
                            </th>
                            <th className="p-4 font-label-md text-label-md text-on-surface-variant uppercase tracking-wider">Name</th>
                            <th className="p-4 font-label-md text-label-md text-on-surface-variant uppercase tracking-wider">Company</th>
                            <th className="p-4 font-label-md text-label-md text-on-surface-variant uppercase tracking-wider">Role</th>
                            <th className="p-4 font-label-md text-label-md text-on-surface-variant uppercase tracking-wider">Email</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-outline-variant">
                          {autoLeads.map((l, i) => (
                            <tr key={i} className={`hover:bg-surface-container-highest/40 transition-colors group ${!selectedLeads.has(l.email) ? 'opacity-50' : ''}`}>
                              <td className="p-4 text-center">
                                <input 
                                  type="checkbox" 
                                  className="rounded border-outline-variant bg-surface-container text-primary focus:ring-primary/20 cursor-pointer"
                                  checked={selectedLeads.has(l.email)}
                                  onChange={(e) => {
                                    const newSet = new Set(selectedLeads);
                                    if (e.target.checked) newSet.add(l.email);
                                    else newSet.delete(l.email);
                                    setSelectedLeads(newSet);
                                  }}
                                />
                              </td>
                              <td className="p-4 flex items-center gap-3">
                                <div className="w-8 h-8 rounded-full bg-tertiary-container flex items-center justify-center text-[10px] text-on-tertiary-container font-bold">
                                  {l.contact_name ? l.contact_name.substring(0,2).toUpperCase() : 'NA'}
                                </div>
                                <span className="font-body-md text-on-surface">{l.contact_name || 'N/A'}</span>
                              </td>
                              <td className="p-4 text-on-surface-variant font-body-sm">{l.company || 'N/A'}</td>
                              <td className="p-4">
                                <span className="px-2 py-1 rounded bg-primary/10 text-primary font-label-md text-label-md">{l.job_title || 'N/A'}</span>
                              </td>
                              <td className="p-4 text-on-surface-variant font-body-sm">{l.email}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                    <div className="p-4 flex items-center justify-between border-t border-outline-variant bg-surface-container-low/50">
                      <span className="font-body-sm text-on-surface-variant">Showing {autoLeads.length} leads</span>
                    </div>
                  </div>
                </>
              )}
            </div>
          )}

          {/* OUTREACH HUB TAB */}
          {activeTab === 'outreach' && (
            <div className="max-w-6xl mx-auto px-container-padding-mobile lg:px-container-padding-desktop pt-stack-lg space-y-stack-lg">
              <header className="mb-stack-lg">
                <h2 className="font-headline-lg-mobile md:font-headline-lg text-headline-lg-mobile md:text-headline-lg text-on-surface">Outreach Hub</h2>
                <p className="font-body-sm text-body-sm text-on-surface-variant mt-1">Automate and personalize your job hunt communication.</p>
              </header>

              <div className="bg-surface-container-low p-1 rounded-xl flex flex-col md:flex-row items-center border border-outline-variant gap-1">
                <button 
                  className={`flex-1 w-full py-2 font-label-md text-label-md rounded-lg shadow-sm transition-colors ${outreachTab === 'single' ? 'bg-secondary-container text-on-secondary-container' : 'text-on-surface-variant hover:text-on-surface'}`}
                  onClick={() => setOutreachTab('single')}
                >
                  Single Job
                </button>
                <button 
                  className={`flex-1 w-full py-2 font-label-md text-label-md rounded-lg shadow-sm transition-colors ${outreachTab === 'bulk' ? 'bg-secondary-container text-on-secondary-container' : 'text-on-surface-variant hover:text-on-surface'}`}
                  onClick={() => setOutreachTab('bulk')}
                >
                  Bulk BCC
                </button>
                <button 
                  className={`flex-1 w-full py-2 font-label-md text-label-md rounded-lg shadow-sm transition-colors ${outreachTab === 'csv' ? 'bg-secondary-container text-on-secondary-container' : 'text-on-surface-variant hover:text-on-surface'}`}
                  onClick={() => setOutreachTab('csv')}
                >
                  Import CSV
                </button>
              </div>

              {outreachTab === 'single' && (
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                  <section className="bg-surface-container border border-outline-variant rounded-xl p-stack-md glass-card">
                    <div className="space-y-4">
                      <div className="flex flex-col gap-1.5">
                        <label className="font-label-md text-label-md text-on-surface-variant ml-1">Company</label>
                        <input className="w-full bg-surface-dim border border-outline-variant rounded-lg px-4 py-3 text-body-md focus:border-primary focus:ring-1 focus:ring-primary outline-none transition-all placeholder:text-outline" placeholder="e.g. Anthropic" type="text" value={company} onChange={e => setCompany(e.target.value)} />
                      </div>
                      <div className="flex flex-col gap-1.5">
                        <label className="font-label-md text-label-md text-on-surface-variant ml-1">Job Title</label>
                        <input className="w-full bg-surface-dim border border-outline-variant rounded-lg px-4 py-3 text-body-md focus:border-primary focus:ring-1 focus:ring-primary outline-none transition-all placeholder:text-outline" placeholder="e.g. Senior UI/UX Designer" type="text" value={jobTitle} onChange={e => setJobTitle(e.target.value)} />
                      </div>
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        <div className="flex flex-col gap-1.5">
                          <label className="font-label-md text-label-md text-on-surface-variant ml-1">Recruiter Name</label>
                          <input className="w-full bg-surface-dim border border-outline-variant rounded-lg px-4 py-3 text-body-md focus:border-primary focus:ring-1 focus:ring-primary outline-none transition-all placeholder:text-outline" placeholder="e.g. Sarah Mitchell" type="text" value={recruiterName} onChange={e => setRecruiterName(e.target.value)} />
                        </div>
                        <div className="flex flex-col gap-1.5">
                          <label className="font-label-md text-label-md text-on-surface-variant ml-1">Recruiter Email</label>
                          <input className="w-full bg-surface-dim border border-outline-variant rounded-lg px-4 py-3 text-body-md focus:border-primary focus:ring-1 focus:ring-primary outline-none transition-all placeholder:text-outline" placeholder="e.g. sarah@company.com" type="email" value={recruiterEmail} onChange={e => setRecruiterEmail(e.target.value)} />
                        </div>
                      </div>
                      <div className="flex flex-col gap-1.5">
                        <label className="font-label-md text-label-md text-on-surface-variant ml-1">AI Model</label>
                        <div className="relative">
                          <select className="w-full appearance-none bg-surface-dim border border-outline-variant rounded-lg px-4 py-3 text-body-md focus:border-primary focus:ring-1 focus:ring-primary outline-none transition-all pr-10" value={aiModel} onChange={e => setAiModel(e.target.value)}>
                            <option value="gemini">Google Gemini 2.5 Flash</option>
                            <option value="claude">Anthropic Claude 3.5 Sonnet</option>
                          </select>
                          <span className="material-symbols-outlined absolute right-3 top-1/2 -translate-y-1/2 text-on-surface-variant pointer-events-none">expand_more</span>
                        </div>
                      </div>
                      <button className="bg-gradient-to-r from-primary to-secondary w-full py-4 rounded-xl font-headline-md text-body-md font-bold text-surface-container-lowest mt-4 active:scale-[0.98] transition-all shadow-[0_0_15px_rgba(192,193,255,0.3)]" onClick={handleGenerateDraft} disabled={isGenerating}>
                        {isGenerating ? "Generating..." : "Generate Personalized Draft"}
                      </button>
                    </div>
                  </section>
                  
                  <section className="bg-surface-container border border-outline-variant rounded-xl p-stack-md glass-card flex flex-col gap-4">
                    <input 
                      type="text" 
                      className="bg-surface-dim border border-outline-variant rounded-lg p-3 text-on-surface font-bold" 
                      placeholder="Subject Line" 
                      value={subject} 
                      onChange={e => setSubject(e.target.value)} 
                    />
                    <textarea 
                      className="bg-surface-dim border border-outline-variant rounded-lg p-3 text-on-surface flex-1 min-h-[300px]" 
                      placeholder="Your generated email draft will appear here..." 
                      value={draft} 
                      onChange={e => setDraft(e.target.value)} 
                    />
                    <button className="bg-secondary-container text-on-secondary-container py-3 rounded-lg font-bold flex items-center justify-center gap-2 hover:opacity-90 transition-opacity" onClick={handleSendEmail} disabled={isSending}>
                      <span className="material-symbols-outlined">send</span> {isSending ? "Sending..." : "Send Email"}
                    </button>
                  </section>
                </div>
              )}

              {outreachTab === 'bulk' && (
                <div className="bg-surface-container border border-outline-variant rounded-xl p-stack-md glass-card flex flex-col gap-4">
                  <h3 className="font-headline-md text-on-surface">Bulk BCC Outreach</h3>
                  <div className="flex flex-col gap-2">
                    <label className="text-on-surface-variant font-label-md">BCC Email Addresses (comma separated)</label>
                    <textarea className="bg-surface-dim border border-outline-variant rounded-lg p-3 text-on-surface" rows={3} value={bccEmails} onChange={e => setBccEmails(e.target.value)} />
                  </div>
                  <div className="flex flex-col gap-2">
                    <label className="text-on-surface-variant font-label-md">Target Job Title</label>
                    <input type="text" className="bg-surface-dim border border-outline-variant rounded-lg p-3 text-on-surface" value={bccJobTitle} onChange={e => setBccJobTitle(e.target.value)} />
                  </div>
                  <button className="bg-gradient-to-r from-primary to-secondary w-full py-4 rounded-xl font-headline-md text-body-md font-bold text-surface-container-lowest mt-4 active:scale-[0.98] transition-all" onClick={handleGenerateBccDraft} disabled={isGeneratingBcc}>
                    {isGeneratingBcc ? "Generating..." : "Generate Universal Draft"}
                  </button>
                  
                  {bccDraft && (
                    <>
                      <input type="text" className="bg-surface-dim border border-outline-variant rounded-lg p-3 text-on-surface font-bold mt-4" value={bccSubject} onChange={e => setBccSubject(e.target.value)} />
                      <textarea className="bg-surface-dim border border-outline-variant rounded-lg p-3 text-on-surface min-h-[200px]" value={bccDraft} onChange={e => setBccDraft(e.target.value)} />
                      <button className="bg-secondary-container text-on-secondary-container py-3 rounded-lg font-bold flex items-center justify-center gap-2 hover:opacity-90" onClick={handleSendBccEmail} disabled={isSendingBcc}>
                        <span className="material-symbols-outlined">send</span> {isSendingBcc ? "Sending..." : "Send via BCC"}
                      </button>
                    </>
                  )}
                </div>
              )}

              {outreachTab === 'csv' && (
                <div className="bg-surface-container border border-outline-variant rounded-xl p-stack-md glass-card flex flex-col gap-4">
                  <h3 className="font-headline-md text-on-surface">Individual Bulk Outreach</h3>
                  {csvMode === 'idle' && (
                    <div className="border-2 border-dashed border-outline-variant rounded-xl p-12 flex flex-col items-center justify-center gap-4 text-on-surface-variant cursor-pointer relative hover:bg-surface-container-highest/20 transition-colors">
                      <span className="material-symbols-outlined text-4xl">upload_file</span>
                      <p>Upload a CSV file (Name, Email, Company, Title)</p>
                      <input type="file" accept=".csv" onChange={handleCsvUpload} className="absolute inset-0 opacity-0 cursor-pointer" />
                    </div>
                  )}
                  {csvMode === 'individual' && csvData.length > 0 && (
                    <>
                      <div className="bg-primary/10 p-4 rounded-lg flex justify-between items-center border border-primary/20">
                        <span className="text-primary font-bold">{csvData.length} leads ready</span>
                        <button className="px-4 py-2 border border-outline-variant rounded text-on-surface-variant hover:bg-surface-container-highest" onClick={() => { setCsvMode('idle'); setCsvData([]); }}>Cancel</button>
                      </div>
                      <div className="flex flex-col gap-2 mt-4">
                        <label className="text-on-surface-variant font-label-md">Default Target Job Title</label>
                        <input type="text" className="bg-surface-dim border border-outline-variant rounded-lg p-3 text-on-surface" value={csvJobTitle} onChange={e => setCsvJobTitle(e.target.value)} />
                      </div>
                      <button className="bg-gradient-to-r from-primary to-secondary text-surface-container-lowest py-3 rounded-lg font-bold" onClick={handleGenerateCsvDraft} disabled={isGeneratingCsv}>
                        {isGeneratingCsv ? "Generating Base Draft..." : "Generate Base Draft"}
                      </button>
                      
                      {csvDraft && (
                        <>
                          <input type="text" className="bg-surface-dim border border-outline-variant rounded-lg p-3 text-on-surface font-bold mt-4" value={csvSubject} onChange={e => setCsvSubject(e.target.value)} />
                          <textarea className="bg-surface-dim border border-outline-variant rounded-lg p-3 text-on-surface min-h-[200px]" value={csvDraft} onChange={e => setCsvDraft(e.target.value)} />
                          <button className="bg-secondary-container text-on-secondary-container py-3 rounded-lg font-bold flex items-center justify-center gap-2 hover:opacity-90" onClick={handleSendCsvIndividual} disabled={isSendingCsv}>
                            <span className="material-symbols-outlined">send</span> {isSendingCsv ? "Sending to all..." : `Send Individually to ${csvData.length} leads`}
                          </button>
                          
                          <div className="mt-4 flex flex-col gap-2 bg-surface-dim rounded-lg p-4 border border-outline-variant overflow-y-auto max-h-60">
                            {csvStatuses.map((s, i) => (
                              <div key={i} className="flex justify-between p-2 border-b border-outline-variant/30 text-sm">
                                <span>{s.email}</span>
                                <span className={s.status === 'success' ? 'text-green-400 font-bold' : s.status === 'error' ? 'text-error font-bold' : 'text-on-surface-variant'}>
                                  {s.status.toUpperCase()}
                                </span>
                              </div>
                            ))}
                          </div>
                        </>
                      )}
                    </>
                  )}
                </div>
              )}

              <section>
                <div className="flex items-center justify-between mb-4 mt-8">
                  <h3 className="font-headline-md text-body-lg font-bold text-on-surface">Job Applications History</h3>
                  <span className="font-label-md text-label-md text-primary bg-primary/10 px-2 py-0.5 rounded-full border border-primary/20">{emailHistory.length} Sent</span>
                </div>
                <div className="space-y-3">
                  {emailHistory.map((h, i) => (
                    <div key={i} className="bg-surface-container border border-outline-variant glass-card rounded-lg p-4 flex flex-col gap-2 hover:border-primary transition-all group">
                      <div className="flex justify-between items-start">
                        <div>
                          <p className="font-body-md text-body-md font-bold text-on-surface">{h.jobTitle}</p>
                          <p className="font-body-sm text-body-sm text-on-surface-variant">{h.companyName}</p>
                        </div>
                        <div className="bg-emerald-500/10 text-emerald-400 px-3 py-1 rounded-full text-[10px] font-bold tracking-wider uppercase border border-emerald-500/20">
                          SENT
                        </div>
                      </div>
                      <div className="flex justify-between items-center mt-2 pt-2 border-t border-outline-variant/50">
                        <span className="font-label-md text-label-md text-on-surface-variant">{new Date(h.date).toLocaleDateString()}</span>
                        <span className="text-xs text-on-surface-variant truncate max-w-[200px]">{h.recruiterEmail}</span>
                      </div>
                    </div>
                  ))}
                </div>
              </section>
            </div>
          )}

          {/* INBOX SCANNER TAB */}
          {activeTab === 'inbox' && (
            <div className="max-w-6xl mx-auto px-container-padding-mobile lg:px-container-padding-desktop pt-stack-lg space-y-stack-lg">
              <header className="flex flex-col md:flex-row md:items-center justify-between gap-stack-md mb-stack-lg">
                <div>
                  <h1 className="font-headline-lg-mobile md:font-headline-lg text-headline-lg-mobile md:text-headline-lg text-on-surface">Reply Scanner</h1>
                  <p className="text-on-surface-variant mt-1 font-body-sm">AI-powered classification of incoming recruiter communications.</p>
                </div>
                <div className="flex items-center gap-stack-sm">
                  <div className="relative inline-block text-left">
                    <select className="flex items-center gap-2 px-4 py-2 rounded-lg border border-outline-variant bg-surface-container text-on-surface hover:bg-surface-container-highest transition-colors font-label-md appearance-none" value={scanDays} onChange={e => setScanDays(parseInt(e.target.value))}>
                      <option value={7}>Last 7 Days</option>
                      <option value={14}>Last 14 Days</option>
                      <option value={30}>Last 30 Days</option>
                    </select>
                  </div>
                  <button className="flex items-center gap-2 px-6 py-2 bg-gradient-to-r from-primary-container to-secondary-container text-on-primary-container rounded-lg font-bold shadow-[0_0_15px_rgba(99,102,241,0.15)] active:scale-95 transition-all duration-200" onClick={handleScanReplies} disabled={isScanning}>
                    {isScanning ? <div className="spinner"></div> : <span className="material-symbols-outlined">radar</span>}
                    {isScanning ? "Scanning..." : "Scan Now"}
                  </button>
                </div>
              </header>

              <div className="grid grid-cols-1 md:grid-cols-3 gap-gutter mb-stack-lg">
                <div className="bg-surface-container border border-outline-variant rounded-xl p-stack-md flex items-center gap-4 glass-card">
                  <div className="w-12 h-12 rounded-full bg-primary/10 flex items-center justify-center">
                    <span className="material-symbols-outlined text-primary">mail</span>
                  </div>
                  <div>
                    <p className="text-label-md text-on-surface-variant uppercase">Emails Scanned</p>
                    <p className="font-headline-md text-on-surface">{emailHistory.length}</p>
                  </div>
                </div>
                <div className="bg-surface-container border border-outline-variant rounded-xl p-stack-md flex items-center gap-4 glass-card">
                  <div className="w-12 h-12 rounded-full bg-secondary-container/20 flex items-center justify-center">
                    <span className="material-symbols-outlined text-secondary">forum</span>
                  </div>
                  <div>
                    <p className="text-label-md text-on-surface-variant uppercase">Replies Found</p>
                    <p className="font-headline-md text-secondary">{scannedReplies.length}</p>
                  </div>
                </div>
                <div className="bg-surface-container border border-outline-variant rounded-xl p-stack-md flex items-center gap-4 glass-card">
                  <div className="w-12 h-12 rounded-full bg-tertiary-container/20 flex items-center justify-center">
                    <span className="material-symbols-outlined text-tertiary">bolt</span>
                  </div>
                  <div>
                    <p className="text-label-md text-on-surface-variant uppercase">Interviews</p>
                    <p className="font-headline-md text-tertiary">{scannedReplies.filter(r => r.classification === 'interview' || r.category === 'interview').length}</p>
                  </div>
                </div>
              </div>

              {scannedReplies.length > 0 && (
                <div className="bg-surface-container border border-outline-variant rounded-xl overflow-hidden glass-card">
                  <div className="overflow-x-auto">
                    <table className="w-full text-left border-collapse">
                      <thead>
                        <tr className="border-b border-outline-variant bg-surface-container-high/50">
                          <th className="px-6 py-4 font-label-md text-on-surface-variant uppercase">Recruiter</th>
                          <th className="px-6 py-4 font-label-md text-on-surface-variant uppercase">Subject</th>
                          <th className="px-6 py-4 font-label-md text-on-surface-variant uppercase">Classification</th>
                          <th className="px-6 py-4 font-label-md text-on-surface-variant uppercase">AI Summary</th>
                          <th className="px-6 py-4 font-label-md text-on-surface-variant uppercase text-right">Date</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-outline-variant/30">
                        {scannedReplies.map((reply, i) => (
                          <tr key={i} className="hover:bg-surface-container-highest/40 transition-colors group">
                            <td className="px-6 py-5">
                              <div className="flex items-center gap-3">
                                <div className="w-8 h-8 rounded-full border border-outline-variant bg-primary-container text-on-primary-container flex items-center justify-center font-bold text-xs">
                                  {reply.sender_name ? reply.sender_name.substring(0,2).toUpperCase() : 'RE'}
                                </div>
                                <span className="font-body-md font-semibold text-on-surface">{reply.sender_name || reply.sender_email || reply.from}</span>
                              </div>
                            </td>
                            <td className="px-6 py-5">
                              <span className="text-on-surface font-medium max-w-[200px] truncate block">{reply.subject}</span>
                            </td>
                            <td className="px-6 py-5">
                              {(reply.classification === 'interview' || reply.category === 'interview') && (
                                <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-secondary-container/20 text-on-secondary-container border border-secondary-container/30 text-label-md">
                                  <span className="w-1.5 h-1.5 rounded-full bg-secondary"></span> Interview Request
                                </span>
                              )}
                              {(reply.classification === 'rejection' || reply.category === 'rejection') && (
                                <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-error-container/20 text-error border border-error-container/30 text-label-md">
                                  <span className="w-1.5 h-1.5 rounded-full bg-error"></span> Rejection
                                </span>
                              )}
                              {(reply.classification === 'other' || reply.category === 'other' || (!reply.classification && !reply.category)) && (
                                <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-primary/10 text-primary border border-primary/20 text-label-md">
                                  <span className="w-1.5 h-1.5 rounded-full bg-primary"></span> Follow-up / Other
                                </span>
                              )}
                            </td>
                            <td className="px-6 py-5">
                              <p className="text-body-sm text-on-surface-variant italic max-w-xs">{reply.summary}</p>
                            </td>
                            <td className="px-6 py-5 text-right font-label-md text-on-surface-variant">
                              {new Date(reply.date).toLocaleDateString()}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* RESUME MANAGER TAB */}
          {activeTab === 'resume' && (
            <div className="max-w-md mx-auto py-stack-lg space-y-stack-lg px-container-padding-mobile">
              <section>
                <h2 className="font-headline-lg-mobile text-headline-lg-mobile text-on-surface">Resume Manager</h2>
                <p className="font-body-sm text-body-sm text-on-surface-variant mt-1">Manage and optimize your resumes for AI-powered job applications.</p>
              </section>

              <section className="relative">
                <div className="border-2 border-dashed border-primary/50 rounded-xl p-stack-lg flex flex-col items-center justify-center text-center bg-surface-container-low transition-all duration-300 hover:bg-surface-container cursor-pointer relative glass-card">
                  <div className="w-16 h-16 rounded-full bg-secondary-container/20 flex items-center justify-center mb-stack-md">
                    <span className="material-symbols-outlined text-primary text-4xl">description</span>
                  </div>
                  <p className="font-body-md text-body-md text-on-surface mb-stack-md">Upload your latest PDF resume here</p>
                  <label className="bg-gradient-to-r from-primary-container to-secondary-container text-on-primary-container font-label-md text-label-md px-6 py-3 rounded-full shadow-lg shadow-primary-container/20 active:scale-95 transition-transform cursor-pointer">
                    Browse Files
                    <input type="file" accept=".pdf" className="hidden" onChange={handleFileUpload} />
                  </label>
                </div>
              </section>

              {isUploadingResume && (
                <div className="bg-surface-container/50 border border-secondary-container/30 p-stack-md rounded-xl flex items-center gap-4 relative overflow-hidden glass-card">
                  <div className="w-12 h-12 bg-secondary-container/20 rounded-lg flex items-center justify-center animate-pulse">
                    <span className="material-symbols-outlined text-secondary">auto_awesome</span>
                  </div>
                  <div className="flex-1 relative z-10">
                    <div className="flex items-center gap-2">
                      <h4 className="font-body-md text-body-md text-on-surface font-semibold">Parsing PDF...</h4>
                      <span className="inline-block w-1.5 h-1.5 bg-secondary rounded-full animate-ping"></span>
                    </div>
                    <p className="font-label-md text-label-md text-secondary">Extracting text for AI context</p>
                  </div>
                </div>
              )}

              {resumeText && !isUploadingResume && (
                <section className="space-y-stack-md">
                  <div className="flex justify-between items-end px-1">
                    <h3 className="font-headline-md text-headline-md text-on-surface">Recently Uploaded</h3>
                  </div>
                  <div className="space-y-stack-sm">
                    <div className="bg-surface-container border border-primary p-stack-md rounded-xl flex items-center gap-4 glass-card">
                      <div className="w-12 h-12 bg-primary/20 rounded-lg flex items-center justify-center">
                        <span className="material-symbols-outlined text-primary">description</span>
                      </div>
                      <div className="flex-1 overflow-hidden">
                        <h4 className="font-body-md text-body-md text-on-surface font-semibold truncate">Current_Active_Resume.pdf</h4>
                        <div className="flex items-center gap-2 mt-0.5">
                          <span className="font-label-md text-label-md text-on-surface-variant text-primary">Parsed successfully</span>
                        </div>
                      </div>
                      <button className="text-primary hover:text-primary-container">
                        <span className="material-symbols-outlined">check_circle</span>
                      </button>
                    </div>
                    
                    <div className="bg-surface-container-low border border-outline-variant p-4 rounded-xl mt-4 max-h-[300px] overflow-y-auto">
                      <p className="text-xs text-on-surface-variant font-mono whitespace-pre-wrap">{resumeText}</p>
                    </div>
                  </div>
                </section>
              )}
            </div>
          )}
        </main>
      </div>
      
      {/* Mobile Bottom Navigation Bar */}
      <nav className="lg:hidden fixed bottom-0 left-0 w-full z-50 flex justify-around items-center px-2 py-2 bg-surface-container border-t border-outline-variant shadow-lg rounded-t-xl">
        <button className={`flex flex-col items-center justify-center p-2 transition-colors active:scale-90 duration-150 ${activeTab === 'home' ? 'bg-primary-container text-on-primary-container rounded-xl' : 'text-on-surface-variant'}`} onClick={() => setActiveTab('home')}>
          <span className="material-symbols-outlined">dashboard</span>
          <span className="font-label-md text-[10px]">Home</span>
        </button>
        <button className={`flex flex-col items-center justify-center p-2 transition-colors active:scale-90 duration-150 ${activeTab === 'auto' ? 'bg-primary-container text-on-primary-container rounded-xl' : 'text-on-surface-variant'}`} onClick={() => setActiveTab('auto')}>
          <span className="material-symbols-outlined">smart_toy</span>
          <span className="font-label-md text-[10px]">Agent</span>
        </button>
        <button className={`flex flex-col items-center justify-center p-2 transition-colors active:scale-90 duration-150 ${activeTab === 'outreach' ? 'bg-primary-container text-on-primary-container rounded-xl' : 'text-on-surface-variant'}`} onClick={() => setActiveTab('outreach')}>
          <span className="material-symbols-outlined">send</span>
          <span className="font-label-md text-[10px]">Outreach</span>
        </button>
        <button className={`flex flex-col items-center justify-center p-2 transition-colors active:scale-90 duration-150 ${activeTab === 'inbox' ? 'bg-primary-container text-on-primary-container rounded-xl' : 'text-on-surface-variant'}`} onClick={() => setActiveTab('inbox')}>
          <span className="material-symbols-outlined">move_to_inbox</span>
          <span className="font-label-md text-[10px]">Scanner</span>
        </button>
        <button className={`flex flex-col items-center justify-center p-2 transition-colors active:scale-90 duration-150 ${activeTab === 'resume' ? 'bg-primary-container text-on-primary-container rounded-xl' : 'text-on-surface-variant'}`} onClick={() => setActiveTab('resume')}>
          <span className="material-symbols-outlined">description</span>
          <span className="font-label-md text-[10px]">Resume</span>
        </button>
      </nav>
    </div>
  );
}
"""

new_content = content[:start_idx] + new_jsx

with open('app/dashboard/page.tsx', 'w', encoding='utf-8') as f:
    f.write(new_content)

print("Successfully updated page.tsx with fully responsive Mobile & Desktop Layout")

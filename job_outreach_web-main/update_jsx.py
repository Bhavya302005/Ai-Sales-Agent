import re

with open('app/dashboard/page.tsx', 'r', encoding='utf-8') as f:
    content = f.read()

# Find the return statement
match = re.search(r'(\s*return\s*\(\s*)<div className="container">', content)
if not match:
    print("Could not find return statement")
    exit(1)

start_idx = match.start(1)

new_jsx = """
  return (
    <div className="bg-background text-on-surface font-body-md min-h-screen flex flex-col md:flex-row overflow-x-hidden">
      
      {/* Sidebar */}
      <aside className="hidden md:flex flex-col h-screen w-64 left-0 sticky bg-surface-container border-r border-outline-variant py-stack-lg gap-stack-sm z-50">
        <div className="px-6 mb-8">
          <h1 className="font-headline-md text-headline-md font-bold text-primary">AI Mailer</h1>
        </div>
        <nav className="flex flex-col flex-1 px-4 gap-2">
          <button 
            className={`flex items-center gap-3 px-4 py-3 rounded-lg duration-200 transition-all ${activeTab === 'auto' ? 'text-primary border-l-4 border-primary bg-primary-container/10' : 'text-on-surface-variant hover:bg-surface-container-highest'}`}
            onClick={() => setActiveTab('auto')}
          >
            <span className="material-symbols-outlined">robot_2</span>
            <span className="font-label-md text-label-md">Auto Agent</span>
          </button>
          
          <button 
            className={`flex items-center gap-3 px-4 py-3 rounded-lg duration-200 transition-all ${activeTab === 'outreach' ? 'text-primary border-l-4 border-primary bg-primary-container/10' : 'text-on-surface-variant hover:bg-surface-container-highest'}`}
            onClick={() => setActiveTab('outreach')}
          >
            <span className="material-symbols-outlined">send</span>
            <span className="font-label-md text-label-md">Outreach</span>
          </button>
          
          <button 
            className={`flex items-center gap-3 px-4 py-3 rounded-lg duration-200 transition-all ${activeTab === 'inbox' ? 'text-primary border-l-4 border-primary bg-primary-container/10' : 'text-on-surface-variant hover:bg-surface-container-highest'}`}
            onClick={() => setActiveTab('inbox')}
          >
            <span className="material-symbols-outlined">mail_lock</span>
            <span className="font-label-md text-label-md">Inbox Scanner</span>
          </button>
          
          <button 
            className={`flex items-center gap-3 px-4 py-3 rounded-lg duration-200 transition-all ${activeTab === 'resume' ? 'text-primary border-l-4 border-primary bg-primary-container/10' : 'text-on-surface-variant hover:bg-surface-container-highest'}`}
            onClick={() => setActiveTab('resume')}
          >
            <span className="material-symbols-outlined">description</span>
            <span className="font-label-md text-label-md">Resume</span>
          </button>
        </nav>
      </aside>

      <div className="flex-1 flex flex-col min-h-screen">
        {/* Top AppBar */}
        <header className="w-full top-0 sticky bg-surface-container-high flex justify-between items-center h-16 px-container-padding-mobile md:px-container-padding-desktop z-40 transition-colors">
          <div className="flex items-center gap-4">
            <button className="md:hidden text-on-surface-variant hover:bg-surface-container-highest p-2 rounded-lg transition-colors">
              <span className="material-symbols-outlined">menu</span>
            </button>
            <div className="flex items-center gap-2">
              <span className="material-symbols-outlined text-primary">
                {activeTab === 'auto' ? 'smart_toy' : activeTab === 'outreach' ? 'send' : activeTab === 'inbox' ? 'mail_lock' : 'description'}
              </span>
              <span className="font-headline-md text-headline-md font-bold text-primary">
                {activeTab === 'auto' ? 'Auto Agent' : activeTab === 'outreach' ? 'Outreach Hub' : activeTab === 'inbox' ? 'Reply Scanner' : 'Resume Manager'}
              </span>
            </div>
          </div>
          <div className="flex items-center gap-4">
            {user && <span className="text-on-surface-variant font-label-md">{user.email}</span>}
            <button className="px-4 py-2 rounded border border-outline-variant text-on-surface hover:bg-surface-container-highest transition-colors font-label-md" onClick={handleSignOut}>
              Sign Out
            </button>
          </div>
        </header>

        <main className="flex-1 p-container-padding-mobile md:p-container-padding-desktop max-w-[1280px] mx-auto w-full flex flex-col gap-stack-lg">
          
          {/* AUTO AGENT TAB */}
          {activeTab === 'auto' && (
            <>
              <section className="glass-card rounded-xl p-stack-lg flex flex-col gap-6">
                <div className="flex flex-col gap-2">
                  <h2 className="font-headline-lg text-headline-lg text-on-surface">Source New Talent</h2>
                  <p className="font-body-md text-on-surface-variant">Define your target role and let the AI agent identify high-quality recruiter leads from your Supabase database.</p>
                </div>
                <div className="flex flex-col md:flex-row gap-4">
                  <div className="flex-1 relative group glow-indigo rounded-lg bg-surface-container-lowest border border-outline-variant overflow-hidden transition-all">
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
                    className="ai-gradient-btn text-white px-8 py-4 rounded-lg font-bold flex items-center justify-center gap-2 hover:opacity-90 active:scale-95 duration-150 transition-all"
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
                      <span className="font-label-md text-label-md text-on-surface-variant uppercase tracking-wider">
                        Found {autoLeads.length} Leads ({selectedLeads.size} Selected)
                      </span>
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

                  <div className="glass-card rounded-xl overflow-hidden border border-outline-variant">
                    <div className="overflow-x-auto" style={{ maxHeight: '400px' }}>
                      <table className="w-full text-left border-collapse">
                        <thead className="sticky top-0 bg-surface-container-high border-b border-outline-variant z-10">
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
                            <tr key={i} className={`hover:bg-surface-container-highest/30 transition-colors group ${!selectedLeads.has(l.email) ? 'opacity-50' : ''}`}>
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
                              <td className="p-4 font-body-md text-on-surface">{l.contact_name || 'N/A'}</td>
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
                  </div>
                </>
              )}
            </>
          )}

          {/* OUTREACH HUB TAB */}
          {activeTab === 'outreach' && (
            <div className="flex flex-col gap-6">
              <div className="flex gap-4 border-b border-outline-variant pb-2">
                <button 
                  className={`pb-2 px-2 font-label-md text-label-md ${outreachTab === 'single' ? 'text-primary border-b-2 border-primary' : 'text-on-surface-variant'}`}
                  onClick={() => setOutreachTab('single')}
                >
                  Single Job
                </button>
                <button 
                  className={`pb-2 px-2 font-label-md text-label-md ${outreachTab === 'bulk' ? 'text-primary border-b-2 border-primary' : 'text-on-surface-variant'}`}
                  onClick={() => setOutreachTab('bulk')}
                >
                  Bulk BCC
                </button>
                <button 
                  className={`pb-2 px-2 font-label-md text-label-md ${outreachTab === 'csv' ? 'text-primary border-b-2 border-primary' : 'text-on-surface-variant'}`}
                  onClick={() => setOutreachTab('csv')}
                >
                  CSV / Auto Import
                </button>
              </div>

              {outreachTab === 'single' && (
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                  <div className="glass-card rounded-xl p-stack-lg flex flex-col gap-4">
                    <h3 className="font-headline-md text-on-surface">Target Details</h3>
                    <div className="flex flex-col gap-2">
                      <label className="text-on-surface-variant font-label-md">Company Name</label>
                      <input type="text" className="bg-surface-container-lowest border border-outline-variant rounded-lg p-3 text-on-surface" value={company} onChange={e => setCompany(e.target.value)} />
                    </div>
                    <div className="flex flex-col gap-2">
                      <label className="text-on-surface-variant font-label-md">Job Title</label>
                      <input type="text" className="bg-surface-container-lowest border border-outline-variant rounded-lg p-3 text-on-surface" value={jobTitle} onChange={e => setJobTitle(e.target.value)} />
                    </div>
                    <div className="flex flex-col gap-2">
                      <label className="text-on-surface-variant font-label-md">Recruiter Name (Optional)</label>
                      <input type="text" className="bg-surface-container-lowest border border-outline-variant rounded-lg p-3 text-on-surface" value={recruiterName} onChange={e => setRecruiterName(e.target.value)} />
                    </div>
                    <div className="flex flex-col gap-2">
                      <label className="text-on-surface-variant font-label-md">Recruiter Email (Optional)</label>
                      <input type="email" className="bg-surface-container-lowest border border-outline-variant rounded-lg p-3 text-on-surface" value={recruiterEmail} onChange={e => setRecruiterEmail(e.target.value)} />
                    </div>
                    <div className="flex flex-col gap-2">
                      <label className="text-on-surface-variant font-label-md">AI Model</label>
                      <select className="bg-surface-container-lowest border border-outline-variant rounded-lg p-3 text-on-surface" value={aiModel} onChange={e => setAiModel(e.target.value)}>
                        <option value="gemini">Google Gemini 2.5 Flash</option>
                        <option value="claude">Anthropic Claude 3.5 Sonnet</option>
                      </select>
                    </div>
                    <button className="ai-gradient-btn text-white py-3 rounded-lg font-bold mt-4" onClick={handleGenerateDraft} disabled={isGenerating}>
                      {isGenerating ? "Generating..." : "Generate Personalized Draft"}
                    </button>
                  </div>
                  
                  <div className="glass-card rounded-xl p-stack-lg flex flex-col gap-4">
                    <h3 className="font-headline-md text-on-surface">Email Draft</h3>
                    <input 
                      type="text" 
                      className="bg-surface-container-lowest border border-outline-variant rounded-lg p-3 text-on-surface font-bold" 
                      placeholder="Subject Line" 
                      value={subject} 
                      onChange={e => setSubject(e.target.value)} 
                    />
                    <textarea 
                      className="bg-surface-container-lowest border border-outline-variant rounded-lg p-3 text-on-surface flex-1 min-h-[300px]" 
                      placeholder="Your generated email draft will appear here..." 
                      value={draft} 
                      onChange={e => setDraft(e.target.value)} 
                    />
                    <button className="bg-secondary-container text-on-secondary-container py-3 rounded-lg font-bold flex items-center justify-center gap-2" onClick={handleSendEmail} disabled={isSending}>
                      <span className="material-symbols-outlined">send</span> {isSending ? "Sending..." : "Send Email"}
                    </button>
                  </div>
                </div>
              )}

              {outreachTab === 'bulk' && (
                <div className="glass-card rounded-xl p-stack-lg flex flex-col gap-4">
                  <h3 className="font-headline-md text-on-surface">Bulk BCC Outreach</h3>
                  <div className="flex flex-col gap-2">
                    <label className="text-on-surface-variant font-label-md">BCC Email Addresses (comma separated)</label>
                    <textarea className="bg-surface-container-lowest border border-outline-variant rounded-lg p-3 text-on-surface" rows={3} value={bccEmails} onChange={e => setBccEmails(e.target.value)} />
                  </div>
                  <div className="flex flex-col gap-2">
                    <label className="text-on-surface-variant font-label-md">Target Job Title</label>
                    <input type="text" className="bg-surface-container-lowest border border-outline-variant rounded-lg p-3 text-on-surface" value={bccJobTitle} onChange={e => setBccJobTitle(e.target.value)} />
                  </div>
                  <button className="ai-gradient-btn text-white py-3 rounded-lg font-bold" onClick={handleGenerateBccDraft} disabled={isGeneratingBcc}>
                    {isGeneratingBcc ? "Generating..." : "Generate Universal Draft"}
                  </button>
                  
                  {bccDraft && (
                    <>
                      <input type="text" className="bg-surface-container-lowest border border-outline-variant rounded-lg p-3 text-on-surface font-bold mt-4" value={bccSubject} onChange={e => setBccSubject(e.target.value)} />
                      <textarea className="bg-surface-container-lowest border border-outline-variant rounded-lg p-3 text-on-surface min-h-[200px]" value={bccDraft} onChange={e => setBccDraft(e.target.value)} />
                      <button className="bg-secondary-container text-on-secondary-container py-3 rounded-lg font-bold flex items-center justify-center gap-2" onClick={handleSendBccEmail} disabled={isSendingBcc}>
                        <span className="material-symbols-outlined">send</span> {isSendingBcc ? "Sending..." : "Send via BCC"}
                      </button>
                    </>
                  )}
                </div>
              )}

              {outreachTab === 'csv' && (
                <div className="glass-card rounded-xl p-stack-lg flex flex-col gap-4">
                  <h3 className="font-headline-md text-on-surface">Individual Bulk Outreach</h3>
                  {csvMode === 'idle' && (
                    <div className="border-2 border-dashed border-outline-variant rounded-xl p-12 flex flex-col items-center justify-center gap-4 text-on-surface-variant">
                      <span className="material-symbols-outlined text-4xl">upload_file</span>
                      <p>Upload a CSV file (Name, Email, Company, Title)</p>
                      <input type="file" accept=".csv" onChange={handleCsvUpload} className="text-sm" />
                    </div>
                  )}
                  {csvMode === 'individual' && csvData.length > 0 && (
                    <>
                      <div className="bg-primary-container/10 p-4 rounded-lg flex justify-between items-center">
                        <span className="text-primary font-bold">{csvData.length} leads ready</span>
                        <button className="px-4 py-2 border border-outline-variant rounded text-on-surface-variant" onClick={() => { setCsvMode('idle'); setCsvData([]); }}>Cancel</button>
                      </div>
                      <div className="flex flex-col gap-2 mt-4">
                        <label className="text-on-surface-variant font-label-md">Default Target Job Title</label>
                        <input type="text" className="bg-surface-container-lowest border border-outline-variant rounded-lg p-3 text-on-surface" value={csvJobTitle} onChange={e => setCsvJobTitle(e.target.value)} />
                      </div>
                      <button className="ai-gradient-btn text-white py-3 rounded-lg font-bold" onClick={handleGenerateCsvDraft} disabled={isGeneratingCsv}>
                        {isGeneratingCsv ? "Generating Base Draft..." : "Generate Base Draft"}
                      </button>
                      
                      {csvDraft && (
                        <>
                          <input type="text" className="bg-surface-container-lowest border border-outline-variant rounded-lg p-3 text-on-surface font-bold mt-4" value={csvSubject} onChange={e => setCsvSubject(e.target.value)} />
                          <textarea className="bg-surface-container-lowest border border-outline-variant rounded-lg p-3 text-on-surface min-h-[200px]" value={csvDraft} onChange={e => setCsvDraft(e.target.value)} />
                          <button className="bg-secondary-container text-on-secondary-container py-3 rounded-lg font-bold flex items-center justify-center gap-2" onClick={handleSendCsvIndividual} disabled={isSendingCsv}>
                            <span className="material-symbols-outlined">send</span> {isSendingCsv ? "Sending to all..." : `Send Individually to ${csvData.length} leads`}
                          </button>
                          
                          <div className="mt-4 flex flex-col gap-2">
                            {csvStatuses.map((s, i) => (
                              <div key={i} className="flex justify-between p-2 border-b border-outline-variant/30 text-sm">
                                <span>{s.email}</span>
                                <span className={s.status === 'success' ? 'text-green-400' : s.status === 'error' ? 'text-error' : 'text-on-surface-variant'}>
                                  {s.status}
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
            </div>
          )}

          {/* INBOX SCANNER TAB */}
          {activeTab === 'inbox' && (
            <div className="flex flex-col gap-6">
              <section className="glass-card rounded-xl p-stack-lg flex flex-col md:flex-row justify-between items-center gap-4">
                <div>
                  <h2 className="font-headline-lg text-headline-lg text-on-surface">Reply Scanner</h2>
                  <p className="font-body-md text-on-surface-variant">Scan your Gmail for replies from recruiters you contacted.</p>
                </div>
                <div className="flex gap-4 items-center">
                  <select className="bg-surface-container-lowest border border-outline-variant rounded-lg p-3 text-on-surface" value={scanDays} onChange={e => setScanDays(parseInt(e.target.value))}>
                    <option value={7}>Last 7 Days</option>
                    <option value={14}>Last 14 Days</option>
                    <option value={30}>Last 30 Days</option>
                  </select>
                  <button className="ai-gradient-btn text-white px-8 py-3 rounded-lg font-bold flex items-center justify-center gap-2" onClick={handleScanReplies} disabled={isScanning}>
                    {isScanning ? <div className="spinner"></div> : <span className="material-symbols-outlined">search</span>}
                    {isScanning ? "Scanning..." : "Scan Now"}
                  </button>
                </div>
              </section>

              {scannedReplies.length > 0 && (
                <div className="glass-card rounded-xl overflow-hidden border border-outline-variant">
                  <table className="w-full text-left border-collapse">
                    <thead className="bg-surface-container-high border-b border-outline-variant">
                      <tr>
                        <th className="p-4 font-label-md text-label-md text-on-surface-variant uppercase">Recruiter</th>
                        <th className="p-4 font-label-md text-label-md text-on-surface-variant uppercase">Subject</th>
                        <th className="p-4 font-label-md text-label-md text-on-surface-variant uppercase">Classification</th>
                        <th className="p-4 font-label-md text-label-md text-on-surface-variant uppercase">Summary</th>
                        <th className="p-4 font-label-md text-label-md text-on-surface-variant uppercase">Date</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-outline-variant">
                      {scannedReplies.map((reply, i) => (
                        <tr key={i} className="hover:bg-surface-container-highest/30">
                          <td className="p-4 font-body-md text-on-surface">{reply.from}</td>
                          <td className="p-4 text-on-surface-variant font-body-sm">{reply.subject}</td>
                          <td className="p-4">
                            <span className={`px-2 py-1 rounded font-label-md text-label-md ${
                              reply.classification === 'interview' ? 'bg-primary/20 text-primary' : 
                              reply.classification === 'rejection' ? 'bg-error/20 text-error' : 
                              'bg-tertiary/20 text-tertiary'
                            }`}>
                              {reply.classification.toUpperCase()}
                            </span>
                          </td>
                          <td className="p-4 text-on-surface-variant font-body-sm">{reply.summary}</td>
                          <td className="p-4 text-on-surface-variant font-body-sm">{new Date(reply.date).toLocaleDateString()}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          )}

          {/* RESUME MANAGER TAB */}
          {activeTab === 'resume' && (
            <div className="glass-card rounded-xl p-stack-lg flex flex-col gap-6 items-center">
              <h2 className="font-headline-lg text-headline-lg text-on-surface w-full">Resume Manager</h2>
              <div className="w-full max-w-2xl border-2 border-dashed border-outline-variant rounded-xl p-16 flex flex-col items-center justify-center gap-4 text-on-surface-variant hover:bg-surface-container-highest/50 transition-colors">
                <span className="material-symbols-outlined text-6xl text-primary">upload_file</span>
                <p className="font-body-lg text-on-surface">Upload your latest PDF resume here</p>
                <label className="ai-gradient-btn text-white px-8 py-3 rounded-lg font-bold cursor-pointer mt-4">
                  Browse Files
                  <input type="file" accept=".pdf" className="hidden" onChange={handleFileUpload} />
                </label>
              </div>
              {isUploadingResume && <div className="flex items-center gap-2"><div className="spinner"></div><p>Parsing PDF...</p></div>}
              {resumeText && (
                <div className="w-full max-w-2xl bg-surface-container-low border border-outline-variant p-6 rounded-xl mt-4">
                  <div className="flex justify-between items-center mb-4">
                    <h3 className="font-headline-md text-primary flex items-center gap-2"><span className="material-symbols-outlined">check_circle</span> Resume Uploaded Successfully</h3>
                  </div>
                  <div className="text-on-surface-variant text-sm whitespace-pre-wrap max-h-[300px] overflow-y-auto font-mono bg-surface-container-lowest p-4 rounded">
                    {resumeText}
                  </div>
                </div>
              )}
            </div>
          )}

        </main>
      </div>
      
      {/* Mobile Bottom Nav */}
      <nav className="md:hidden fixed bottom-0 left-0 right-0 h-16 bg-surface-container-high flex items-center justify-around z-50 border-t border-outline-variant/30">
        <button className={`flex flex-col items-center gap-1 ${activeTab === 'auto' ? 'text-primary' : 'text-on-surface-variant'}`} onClick={() => setActiveTab('auto')}>
          <span className="material-symbols-outlined">robot_2</span>
          <span className="text-[10px] font-bold">Auto Agent</span>
        </button>
        <button className={`flex flex-col items-center gap-1 ${activeTab === 'outreach' ? 'text-primary' : 'text-on-surface-variant'}`} onClick={() => setActiveTab('outreach')}>
          <span className="material-symbols-outlined">send</span>
          <span className="text-[10px]">Outreach</span>
        </button>
        <button className={`flex flex-col items-center gap-1 ${activeTab === 'inbox' ? 'text-primary' : 'text-on-surface-variant'}`} onClick={() => setActiveTab('inbox')}>
          <span className="material-symbols-outlined">mail_lock</span>
          <span className="text-[10px]">Scanner</span>
        </button>
        <button className={`flex flex-col items-center gap-1 ${activeTab === 'resume' ? 'text-primary' : 'text-on-surface-variant'}`} onClick={() => setActiveTab('resume')}>
          <span className="material-symbols-outlined">description</span>
          <span className="text-[10px]">Resume</span>
        </button>
      </nav>
    </div>
  );
}
"""

# Replace in content
new_content = content[:start_idx] + new_jsx

with open('app/dashboard/page.tsx', 'w', encoding='utf-8') as f:
    f.write(new_content)

print("Successfully updated page.tsx with Tailwind Layout")

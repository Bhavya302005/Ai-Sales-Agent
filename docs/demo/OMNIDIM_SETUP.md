# OmniDimension real-call setup

This is the selected real PSTN demo path. It preserves SignalPath's operator approval, consent,
suppression, calling window, budget, concurrency, pause switch, idempotency, and manual dispatch
checks. It never starts a bulk or unattended campaign.

## 1. Create the provider resources

1. Create an OmniDimension account and generate an API key under API Management.
2. Create one **Outgoing** agent and note its numeric agent ID.
3. Select **English (India)** and **Hindi**. Disable provider-side call recording unless the
   participant has separately consented to recording.
4. Buy/verify one provider number or use the account's default outbound number. A specific number ID
   is optional.
5. Use only the synthetic/consenting test destination. The trial includes roughly ten voice minutes;
   number rental and telephony can still require wallet credit.

## 2. Agent instructions

Configure the agent with the following bounded behavior. The call context supplies
`{{company}}` and `{{business_requirement}}` from reviewed application evidence.

```text
You are SignalPath's AI sales qualification assistant. State clearly that you are an AI assistant.
You are calling {{company}} about this reviewed requirement: {{business_requirement}}.

First confirm you reached the intended participant. Right after confirming the participant, ask directly:
"Would you like me to connect our real sales agent right now into this call?"

If they confirm yes (e.g., "yes", "sure", "connect me", "add them"), immediately invoke the `transfer-call` tool.
Read only the tool's `safe_agent_message`.

If they say no or want to continue with you, ask concise questions about need, current environment, scope,
desired outcome, timeline, and whether a budget range is known. Preserve unknown answers as unknown.
Answer only from approved knowledge. Speak in English or Hindi according to the participant's preference.

If live transfer is declined or not reachable, ask: "May I send you a brief summary and Calendly link
by text and email, and if you do not book, may we call you once more within 48 hours?"
Call `send-booking-link` only with explicit channel permissions. End politely after a recap.
```

Configure these extracted variables with conservative prompts:

- `consent_confirmed`: `yes`, `no`, or `unknown`.
- `wrong_person`: `yes`, `no`, or `unknown`.
- `opt_out`: `yes`, `no`, or `unknown`.
- `interest`: `confirmed`, `declined`, or `unknown`—never infer from sentiment alone.
- `need`, `scope`, and `timeline`: participant-stated text or `unknown`.
- `authority_known` and `budget_known`: `yes`, `no`, or `unknown`.
- `callback_requested`: `confirmed`, `declined`, or `unknown`.
- `sms_consent_confirmed`: `yes` only after explicit permission, otherwise `no` or `unknown`.
- `email_consent_confirmed`: `yes` only after explicit permission to send the post-call summary
  and Calendly link by email; otherwise `no` or `unknown`.
- `booking_retry_consent_confirmed`: `yes` only after explicit one-retry permission, otherwise
  `no` or `unknown`.

Configure an OmniDimension custom function named `send-booking-link`:

- Method: `POST`
- URL: `<PUBLIC_API_BASE_URL>/api/v1/provider-tools/omnidim/send-booking-link`
- Header: `X-Omnidim-Tool-Secret: <OMNIDIM_TOOL_SECRET>`
- JSON body: `call_id`, `sms_consent_confirmed`, `email_consent_confirmed`, and
  `retry_consent_confirmed`

Configure an OmniDimension custom function named `transfer-call`:

- Method: `POST`
- URL: `<PUBLIC_API_BASE_URL>/api/v1/provider-tools/omnidim/transfer-call`
- Header: `X-Omnidim-Tool-Secret: <OMNIDIM_TOOL_SECRET>`
- JSON body: `call_id`, `attendee_consent_confirmed`

Under the OmniDimension Agent's **Call Transfer** settings:
- Enable **Custom API transfer**.
When the attendee confirms interest in speaking with a real sales representative during the call, the agent invokes `transfer-call`, which returns `__omni_transfer_number` to bridge the human sales representative directly into the active PSTN call.

The call ID is supplied in the dynamic call context. The functions must not accept arbitrary external phone numbers or bypass tool authentication.

## 3. Local configuration

Put these values in `.env`; never paste the API key into source control or chat:

```text
VOICE_TRANSPORT=omnidim
ENABLE_OUTBOUND_PSTN=true
OMNIDIM_API_KEY=<secret API key>
OMNIDIM_AGENT_ID=<numeric agent ID>
OMNIDIM_FROM_NUMBER_ID=<optional numeric number ID>
OMNIDIM_TEST_TO_NUMBER=<consenting E.164 test number>
PUBLIC_API_BASE_URL=<public HTTPS API origin>
OMNIDIM_TOOL_SECRET=<separate high-entropy secret>
CALENDLY_ACCESS_TOKEN=<secret token with scheduling_links:write>
CALENDLY_EVENT_TYPE_URI=<existing Calendly event-type URI>
CALENDLY_ORGANIZATION_URI=<Calendly organization URI>
CALENDLY_WEBHOOK_SIGNING_KEY=<webhook signing secret>
SMS_MODE=mock
BOOKING_RETRY_DELAY_MINUTES=1440
BOOKING_DEMO_MODE=true
BOOKING_SCHEDULER_MODE=inline
```

Create the Calendly webhook subscription as a separate deployment step for `invitee.created` and
`invitee.canceled`, targeting
`<PUBLIC_API_BASE_URL>/api/v1/webhooks/calendly`. Use the configured organization scope and store the
returned signing key only in the deployment secret. For live SMS later, set `SMS_MODE=twilio`, add
`TWILIO_MESSAGING_FROM_NUMBER`, and configure Twilio's incoming-message webhook to
`<PUBLIC_API_BASE_URL>/api/v1/webhooks/twilio/sms`.

Restart the API and web services. In **Campaigns**, approve the test lead, attest PSTN consent,
prepare the real call, and click **Place real test call**. Open the call and use **Refresh provider
result** after it finishes. The application matches the numeric request ID, imports bounded final
interactions, preserves unknowns, and creates a handoff only when an extracted variable explicitly
confirms interest or follow-up.

## 4. Readiness and fallback

- Administration must show OmniDimension as configured before dispatch is enabled.
- Integrations must show Calendly ready and `SMS mode: mock`; the call page must say that no SMS was
  sent and exposes a copy-link operator action for the demo.
- A 401/403 is configuration-required; a 429/5xx is temporary and remains operator-controlled.
- If the request is not yet in the latest bounded call-log page, refresh later; no second call is
  dispatched.
- OmniDimension does not currently document an individual-call hangup API. Stop an active provider
  call from its dashboard; the local UI does not falsely claim a remote hangup.
- The guaranteed fallback remains the consent-gated browser call.

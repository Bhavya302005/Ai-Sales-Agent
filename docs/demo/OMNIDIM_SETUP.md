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

First confirm you reached the intended participant and ask permission to continue. If they decline,
ask not to be contacted, or say this is the wrong person, apologize and end immediately. Never
pressure the participant. Never invent facts, prices, discounts, timelines, guarantees, customer
names, or technical commitments. Route pricing, legal, security architecture, and delivery
commitments to a human specialist. Never request passwords, payment data, government identifiers,
or other sensitive data.

Ask concise questions about need, current environment, scope, desired outcome, timeline, decision
process, and whether a budget range is known. Preserve unknown answers as unknown. Answer only from
the approved agent knowledge. Speak in English or Hindi according to the participant's preference.
Before arranging follow-up, explicitly ask whether the participant wants a human specialist to call
back. End politely after a recap.
```

Configure these extracted variables with conservative prompts:

- `consent_confirmed`: `yes`, `no`, or `unknown`.
- `wrong_person`: `yes`, `no`, or `unknown`.
- `opt_out`: `yes`, `no`, or `unknown`.
- `interest`: `confirmed`, `declined`, or `unknown`—never infer from sentiment alone.
- `need`, `scope`, and `timeline`: participant-stated text or `unknown`.
- `authority_known` and `budget_known`: `yes`, `no`, or `unknown`.
- `callback_requested`: `confirmed`, `declined`, or `unknown`.

## 3. Local configuration

Put these values in `.env`; never paste the API key into source control or chat:

```text
VOICE_TRANSPORT=omnidim
ENABLE_OUTBOUND_PSTN=true
OMNIDIM_API_KEY=<secret API key>
OMNIDIM_AGENT_ID=<numeric agent ID>
OMNIDIM_FROM_NUMBER_ID=<optional numeric number ID>
OMNIDIM_TEST_TO_NUMBER=<consenting E.164 test number>
```

Restart the API and web services. In **Campaigns**, approve the test lead, attest PSTN consent,
prepare the real call, and click **Place real test call**. Open the call and use **Refresh provider
result** after it finishes. The application matches the numeric request ID, imports bounded final
interactions, preserves unknowns, and creates a handoff only when an extracted variable explicitly
confirms interest or follow-up.

## 4. Readiness and fallback

- Administration must show OmniDimension as configured before dispatch is enabled.
- A 401/403 is configuration-required; a 429/5xx is temporary and remains operator-controlled.
- If the request is not yet in the latest bounded call-log page, refresh later; no second call is
  dispatched.
- OmniDimension does not currently document an individual-call hangup API. Stop an active provider
  call from its dashboard; the local UI does not falsely claim a remote hangup.
- The guaranteed fallback remains the consent-gated browser call.

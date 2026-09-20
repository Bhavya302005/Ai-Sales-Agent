import { expect, type Page, test } from "@playwright/test";

async function installBrowserVoiceFakes(page: Page) {
  await page.addInitScript(() => {
    type RecognitionResultEvent = {
      resultIndex: number;
      results: ArrayLike<{ isFinal: boolean; 0: { transcript: string } }>;
    };
    type FakeRecognitionShape = {
      onstart: (() => void) | null;
      onspeechstart: (() => void) | null;
      onspeechend: (() => void) | null;
      onresult: ((event: RecognitionResultEvent) => void) | null;
      onerror: ((event: Event & { error: string }) => void) | null;
      onend: (() => void) | null;
    };
    let activeRecognition: FakeRecognitionShape | null = null;

    class FakeRecognition implements FakeRecognitionShape {
      lang = "en-IN";
      interimResults = true;
      continuous = false;
      onstart: (() => void) | null = null;
      onspeechstart: (() => void) | null = null;
      onspeechend: (() => void) | null = null;
      onresult: ((event: RecognitionResultEvent) => void) | null = null;
      onerror: ((event: Event & { error: string }) => void) | null = null;
      onend: (() => void) | null = null;

      start() {
        activeRecognition = this;
        queueMicrotask(() => this.onstart?.());
      }

      stop() {
        queueMicrotask(() => this.onend?.());
      }

      abort() {
        if (activeRecognition === this) activeRecognition = null;
        queueMicrotask(() => this.onend?.());
      }
    }

    class FakeUtterance {
      text: string;
      lang = "en-IN";
      rate = 1;
      pitch = 1;
      onstart: (() => void) | null = null;
      onend: (() => void) | null = null;
      onerror: (() => void) | null = null;

      constructor(text: string) {
        this.text = text;
      }
    }

    const fakeSynthesis = {
      speaking: false,
      cancel() {
        this.speaking = false;
      },
      speak(utterance: FakeUtterance) {
        this.speaking = true;
        setTimeout(() => {
          utterance.onstart?.();
          setTimeout(() => {
            this.speaking = false;
            utterance.onend?.();
          }, 15);
        }, 0);
      },
    };

    Object.defineProperty(window, "SpeechRecognition", { value: FakeRecognition });
    Object.defineProperty(window, "webkitSpeechRecognition", { value: FakeRecognition });
    Object.defineProperty(window, "SpeechSynthesisUtterance", { value: FakeUtterance });
    Object.defineProperty(window, "speechSynthesis", { value: fakeSynthesis });
    Object.defineProperty(window, "__voiceEmit", {
      value: (text: string) => {
        if (!activeRecognition) throw new Error("voice recognition is not active");
        activeRecognition.onspeechstart?.();
        activeRecognition.onresult?.({
          resultIndex: 0,
          results: [{ isFinal: true, 0: { transcript: text } }],
        });
        activeRecognition.onspeechend?.();
      },
    });
  });
}

async function say(page: Page, text: string, expectedAgentText: RegExp) {
  await expect(page.locator(".voice-console h2")).toHaveText("listening");
  await page.evaluate((spokenText) => {
    const emit = (window as unknown as { __voiceEmit: (value: string) => void }).__voiceEmit;
    emit(spokenText);
  }, text);
  await expect(page.locator(".voice-results").getByText(expectedAgentText)).toBeVisible({
    timeout: 8_000,
  });
}

test("approved evidence becomes a consent-gated call, handoff, and idempotent CRM task", async ({
  page,
}) => {
  test.setTimeout(90_000);
  await installBrowserVoiceFakes(page);

  await page.goto("/leads");
  await expect(page).toHaveURL(/\/login$/);
  await page.getByRole("button", { name: "Continue as demo owner" }).click();
  await expect(page).toHaveURL(/\/leads$/);
  await expect(page.getByRole("heading", { name: "Evidence before outreach." })).toBeVisible();

  await page.getByRole("link", { name: /Implement SharePoint Online/ }).click();
  await expect(page.getByRole("heading", { name: "What the source actually says" })).toBeVisible();
  await expect(page.locator(".evidence-card blockquote")).toContainText(
    "Sapphire Legal & Advisory is seeking",
  );
  await expect(page.getByRole("heading", { name: "Still unknown" })).toBeVisible();
  await expect(page.getByText("Approved knowledge only")).toBeVisible();

  await page.locator(".sidebar").getByRole("link", { name: "Campaign" }).click();
  await page.getByRole("button", { name: "Approve test lead" }).click();
  await expect(page.getByRole("button", { name: "Prepare browser test" })).toBeVisible();
  await page.getByRole("button", { name: "Prepare browser test" }).click();
  await page.getByRole("link", { name: "Open browser test" }).click();

  await expect(page.getByRole("heading", { name: "AI qualification session" })).toBeVisible();
  await page.getByRole("button", { name: "Start AI call" }).click();
  await expect(page.locator(".voice-results").getByText(/Hello, I’m the AI assistant/)).toBeVisible();

  await say(page, "yes", /which teams, content, and business processes are in scope/i);
  await say(
    page,
    "Finance and inventory are in scope because month-end close is too slow",
    /What does your current environment look like/i,
  );
  await say(
    page,
    "Mostly on-premises for 280 users across three locations with payroll and banking integrations",
    /What outcome would make this project successful/i,
  );
  await say(
    page,
    "A stable close with little downtime, strong security, and accurate migration",
    /What deadline or business event/i,
  );
  await say(
    page,
    "Before our December renewal, and we are shortlisting partners",
    /Who owns the technical evaluation/i,
  );
  await say(
    page,
    "I lead technical evaluation, operations validates workflows, and the CFO approves",
    /Has a budget range been approved/i,
  );
  await say(page, "Finance is reviewing the budget range", /what questions do you have/i);
  await say(page, "That is all", /Do you confirm/i);
  await say(page, "yes", /human specialist will contact you/);

  await expect(page.locator(".voice-console h2")).toHaveText("completed");
  await expect(page.locator(".voice-results").getByText("handoff_requested")).toBeVisible();
  await page.reload();

  await expect(page.getByRole("heading", { name: "Transcript" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Qualification", exact: true })).toBeVisible();
  await expect(
    page.locator(".transcript-list").getByText(/Finance and inventory are in scope/),
  ).toBeVisible();
  await expect(page.getByRole("heading", { name: "Human handoff" })).toBeVisible();
  await expect(page.getByText(/CRM: mock · not_requested/)).toBeVisible();

  await page.getByRole("button", { name: "Sync to mock CRM" }).click();
  await expect(page.getByText(/CRM: mock · succeeded/)).toBeVisible();
  await expect(page.getByText(/mock:\/\/crm\/tasks\//)).toBeVisible();

  await page.locator(".sidebar").getByRole("link", { name: "Callbacks" }).click();
  await expect(page.getByRole("heading", { name: "Callbacks" })).toBeVisible();
  await page.locator('input[name="scheduled_for"]').fill("2099-01-01T10:00");
  await page.getByRole("button", { name: "Schedule" }).click();
  await expect(page.getByText(/Scheduled/)).toBeVisible();
  await page.getByRole("button", { name: "Mark completed" }).click();
  await expect(page.getByText("completed", { exact: true })).toBeVisible();

  await page.locator(".sidebar").getByRole("link", { name: /Notifications/ }).click();
  await expect(page.getByRole("heading", { name: "Notifications" })).toBeVisible();
  await expect(page.getByText("Follow-up requested")).toBeVisible();
  await page.getByRole("button", { name: "Mark all read" }).click();
  await expect(page.locator(".sidebar").getByRole("link", { name: "Notifications" })).toBeVisible();
});

test("owner controls and due campaign processing remain operator-driven", async ({ page }) => {
  await page.goto("/login");
  await page.getByRole("button", { name: "Continue as demo owner" }).click();
  await expect(page).toHaveURL(/\/leads$/);
  await page.goto("/admin");
  await expect(page.getByRole("heading", { name: "Administration" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Rule-based security posture" })).toBeVisible();
  await expect(page.getByText(/not a predictive fraud model/i)).toBeVisible();
  await page.getByRole("button", { name: "Pause all calls" }).click();
  await expect(page.getByRole("heading", { name: "Calling paused" })).toBeVisible();
  await page.getByRole("button", { name: "Resume calls" }).click();
  await expect(page.getByRole("heading", { name: "Calling available" })).toBeVisible();

  await page.goto("/campaigns");
  await page.getByRole("button", { name: "Process due campaigns" }).click();
  await expect(page.getByText(/ready|scheduled/).first()).toBeVisible();
  await page.goto("/notifications");
  await expect(page.getByText("Campaign is ready")).toBeVisible();
  await page.goto("/analytics");
  await expect(page.getByRole("heading", { name: "Hackathon Demo" })).toBeVisible();
  await expect(page.getByText(/No payment processor is connected/i)).toBeVisible();
});

test("mobile workspace remains usable as an installable web app", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/login");
  await page.getByRole("button", { name: "Continue as demo owner" }).click();
  await expect(page).toHaveURL(/\/leads$/);
  await expect(page.locator('link[rel="manifest"]')).toHaveAttribute("href", /manifest\.webmanifest/);
  await expect(page.locator(".sidebar").getByRole("link", { name: "Campaign" })).toBeVisible();
  const overflow = await page.evaluate(() => ({
    documentWidth: document.documentElement.scrollWidth,
    viewportWidth: window.innerWidth,
  }));
  expect(overflow, JSON.stringify(overflow)).toMatchObject({
    documentWidth: overflow.viewportWidth,
  });
});

test("protected workspace routes return to login after sign-out", async ({ page }) => {
  await page.goto("/login");
  await page.getByRole("button", { name: "Continue as demo owner" }).click();
  await expect(page).toHaveURL(/\/leads$/);
  await page.getByRole("button", { name: "Sign out" }).click();
  await expect(page).toHaveURL(/\/login$/);
  await page.goto("/analytics");
  await expect(page).toHaveURL(/\/login$/);
});

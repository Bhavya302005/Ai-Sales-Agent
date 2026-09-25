<div align="center">
  <img src="https://images.unsplash.com/photo-1486312338219-ce68d2c6f44d?q=80&w=2072&auto=format&fit=crop" alt="Job Outreach Web Banner" width="100%" style="border-radius: 12px; margin-bottom: 20px;" />

  # 🚀 Job Outreach & Campaign Manager

  **Streamline your job search, automate email outreach, and track your success.**
  <br />
  A powerful Next.js application built to manage resumes, parse job data, track cold emails, and run automated campaigns.

  [![Next.js](https://img.shields.io/badge/Next.js-14-black?style=for-the-badge&logo=next.js)](https://nextjs.org/)
  [![Supabase](https://img.shields.io/badge/Supabase-Database-3ECF8E?style=for-the-badge&logo=supabase)](https://supabase.com/)
  [![TailwindCSS](https://img.shields.io/badge/TailwindCSS-Styling-38B2AC?style=for-the-badge&logo=tailwind-css)](https://tailwindcss.com/)
  [![Upstash Redis](https://img.shields.io/badge/Upstash-Redis-FF4B4B?style=for-the-badge&logo=redis)](https://upstash.com/)
</div>

---

## ✨ Features

*   **📄 Resume Parsing:** Automatically extract and analyze data from PDF resumes using `pdf-parse`.
*   **📊 Campaign Management:** Upload CSV files to create and manage bulk email outreach campaigns.
*   **📧 Email Tracking:** Keep tabs on who opened your emails and when they read them.
*   **✍️ Rich Text Editing:** Craft the perfect outreach messages with our integrated `react-quill` editor.
*   **🔐 Authentication:** Secure user management powered by Supabase Auth.
*   **⚡ Blazing Fast:** Built on Next.js App Router for optimal performance and SEO.
*   **🎨 Stunning UI:** Beautiful, responsive design using Tailwind CSS and Framer Motion animations.

## 🛠️ Tech Stack

*   **Frontend:** Next.js (React), Tailwind CSS, Framer Motion, Lucide React
*   **Backend:** Next.js API Routes, Supabase (PostgreSQL)
*   **Caching/Queue:** Upstash Redis
*   **Utilities:** Marked (Markdown), XLSX (Excel parsing), PDF-Parse

## 🚀 Getting Started

Follow these steps to set up the project locally on your machine.

### Prerequisites

*   Node.js (v18+)
*   npm, yarn, or pnpm
*   Supabase Account & Project
*   Upstash Redis Account

### Installation

1.  **Clone the repository:**
    ```bash
    git clone https://github.com/Deathkiller18/job_outreach_web.git
    cd job_outreach_web
    ```

2.  **Install dependencies:**
    ```bash
    npm install
    # or
    yarn install
    # or
    pnpm install
    ```

3.  **Environment Variables:**
    Create a `.env.local` file in the root directory and add your keys:
    ```env
    NEXT_PUBLIC_SUPABASE_URL=your_supabase_url
    NEXT_PUBLIC_SUPABASE_ANON_KEY=your_supabase_anon_key
    UPSTASH_REDIS_REST_URL=your_upstash_url
    UPSTASH_REDIS_REST_TOKEN=your_upstash_token
    ```

4.  **Run the development server:**
    ```bash
    npm run dev
    ```

5.  **Open the app:**
    Navigate to [http://localhost:3000](http://localhost:3000) in your browser.

## 📂 Project Structure

```text
├── app/                  # Next.js App Router (Pages, Layouts, API)
├── components/           # Reusable UI components
├── lib/                  # Utility functions and shared logic (Supabase, etc)
├── public/               # Static assets
└── package.json          # Project dependencies and scripts
```

## 🤝 Contributing

Contributions are what make the open source community such an amazing place to learn, inspire, and create. Any contributions you make are **greatly appreciated**.

1. Fork the Project
2. Create your Feature Branch (`git checkout -b feature/AmazingFeature`)
3. Commit your Changes (`git commit -m 'Add some AmazingFeature'`)
4. Push to the Branch (`git push origin feature/AmazingFeature`)
5. Open a Pull Request

## 📄 License

Distributed under the MIT License. See `LICENSE` for more information.

<div align="center">
  <p>Built with ❤️ for job seekers and recruiters everywhere.</p>
</div>

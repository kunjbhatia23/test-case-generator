# AI-Powered Test Case Generator for GitHub Repositories

A web application built with **React** that allows users to connect to a public GitHub repository, select code files, and use **AI** to automatically generate test case summaries and full test code using the **Google Gemini API**.

---

## Features

-   **GitHub Integration**: Fetches and displays the file tree of any public GitHub repository.
-   **File Selection**: Intuitive file explorer to select one or more relevant code files (`.js`, `.jsx`, `.ts`, `.tsx`) for analysis.
-   **AI-Powered Summary Generation**: Uses the Gemini API to analyze the content of selected files and suggest a list of relevant test case summaries.
-   **AI-Powered Code Generation**: Generates complete, ready-to-use test code (**Jest** & **React Testing Library**) based on a selected summary.
-   **Step-by-Step UI**: Clean, multi-step interface to guide the user through the process.
-   **Responsive Design**: Modern, mobile-friendly UI built with Tailwind CSS.

---

## Tech Stack

-   **Frontend**: React, Vite
-   **Styling**: Tailwind CSS
-   **Icons**: Lucide React
-   **AI**: Google Gemini API
-   **APIs**: GitHub REST API

---

## Setup and Installation

Follow these steps to run the project on your local machine.

### 1. Clone the Repository

```bash
git clone <your-repository-url>
cd test-case-generator
```

### 2. Install Dependencies

```bash
npm install
```

### 3. Set Up Environment Variables

This project requires a Google Gemini API key to function.

1.  **Get an API Key**: Go to [Google AI Studio](https://aistudio.google.com/) and create a free API key.
2.  **Create an Environment File**: In the root of your project, create a file named `.env`.
3.  **Add Your Key**: Add the following line to your `.env` file, replacing `YOUR_API_KEY_HERE` with your key:
    ```
    VITE_GEMINI_API_KEY=YOUR_API_KEY_HERE
    ```
4.  **Update `.gitignore`**: Add `.env` to your `.gitignore` file to keep your key private.

### 4. Run the Development Server

```bash
npm run dev
```

The application should now be running at: `http://localhost:5173`

---

## How to Use

1.  **Enter a GitHub URL**: On the first screen, enter the URL of a public GitHub repository (e.g., `https://github.com/facebook/react`) and click "Fetch Files".
2.  **Select Files**: The app will display a list of relevant code files. Select the files you want to analyze and click "Generate Summaries".
3.  **Choose a Test Case**: The AI will return a list of suggested test case summaries. Click on a summary you'd like to generate code for.
4.  **Generate Code**: Click "Generate Code" to create full test code based on your selection.
5.  **Copy and Use**: Copy the generated code and add it to your project’s test suite. Use the "Back" or "Start Over" buttons to navigate.

---

## Future Improvements

-   **GitHub Authentication**: Support for OAuth2 to allow analyzing private repositories.
-   **Create Pull Request**: Automatically fork the repo, commit the test file, and open a PR on GitHub.
-   **Framework Selection**: Let users choose testing frameworks like Cypress, Playwright, or PyTest.
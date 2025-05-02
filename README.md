
![Logo](logo.svg)

<br>

This plugin creates flashcards using AI by combining **atomic** notes - short notes capturing single ideas - into questions that test your understanding across concepts. Filter by tags, folders, and a prompt, and the plugin generates [Obsidian Spaced Repetition](https://github.com/st3v3nmw/obsidian-spaced-repetition) flashcards with footnotes to the source notes.

**Example**

Given atomic notes:

- `Symmetric Matrix.md`
- `Symmetric Positive Definite Matrix.md`

And topic prompt:

> How does the spectral theorem connect symmetry and positive definiteness?

The plugin outputs flashcards like:

Q: In what way does the spectral theorem connect the symmetry and positive definiteness of a matrix to its eigenvalue spectrum?

?

A: It shows any symmetric matrix is orthogonally diagonalizable. If also positive definite, all eigenvalues are positive.

^[[[`Symmetric Positive Definite Matrix.md`]]]^[[[`Symmetric Matrix.md`]]]



## Features

*   **AI-Powered Generation:** Leverages powerful AI models (configurable, e.g., GPT-4, GPT-3.5-turbo) to create flashcards based on the content of your notes.
*   **Tag-Based Selection:** Identifies source notes for flashcard generation based on a specific tag you define in the settings.
*   **Customizable Prompts:** Tailor the system prompt sent to the AI to guide the style and focus of the generated flashcards.
*   **Configurable Output:** Define the folder where flashcards are saved, the filename template, the separator used within flashcards, and the tag applied to generated flashcards.
*   **Easy Activation:** Generate flashcards via a command palette command or a dedicated modal.
*   **Settings Tab:** Configure your OpenAI API key, model preferences, tags, prompts, and output settings easily.

## How to Use

1.  **Configure Settings:**
    *   Go to Obsidian Settings -> Community Plugins -> AI Spaced Repetition Flashcards -> Options.
    *   Enter your OpenAI API Key.
    *   Choose your desired AI Model Name (ensure it's compatible with the OpenAI API).
    *   Set the `Source Note Tag` (e.g., `#flashcards`). This tag will be used to find notes to process.
    *   Configure the `Flashcard Separator` and `Flashcard Tag` for the output format (compatible with plugins like Obsidian Spaced Repetition).
    *   Adjust the `Output Folder Path` and `Filename Template` if desired.
    *   Refine the `System Prompt` if needed.
2.  **Tag Your Notes:** Add the `Source Note Tag` (that you defined in settings) to the notes you want to generate flashcards from.
3.  **Generate Flashcards:**
    *   Open the Command Palette (Cmd/Ctrl+P).
    *   Run the command "AI Spaced Repetition: Generate Flashcards for Tag".
    *   Alternatively, use the modal triggered by the command or potentially a ribbon icon (if configured).
    *   The plugin will gather content from tagged notes and send it to the AI.
    *   Generated flashcards will be saved to your specified output folder.

## Configuration Details

*   **OpenAI API Key:** (Required) Your secret key for accessing the OpenAI API.
*   **Model Name:** The specific AI model to use.
*   **Source Note Tag:** The tag used to identify notes for processing.
*   **Flashcard Separator:** The separator used between question and answer in the generated file.
*   **Flashcard Tag:** The tag added to the end of each generated flashcard line.
*   **Output Folder Path:** The vault path where generated flashcard files will be saved.
*   **Output Filename Template:** A template for naming the output files. Uses `{{date}}` and `{{time}}` placeholders.
*   **System Prompt:** The detailed instructions sent to the AI to guide flashcard generation. You can customize this to change the AI's behavior.

## Known Limitations

*   **Image Handling:** Currently, inline images in notes (`![[]]` or `![]()`) are not processed or included in the flashcards. Only the Markdown text itself is sent to the AI.
*   **API Costs:** Generating flashcards uses the OpenAI API, which incurs costs based on usage. Monitor your OpenAI account usage.
*   **Rate Limits:** You might encounter API rate limits if generating a very large number of flashcards at once.

## Installation

1.  Ensure Community Plugins are enabled in Obsidian (Settings -> Community Plugins -> Turn on Community plugins).
2.  Browse Community Plugins and search for "AI Spaced Repetition Flashcards".
3.  Install the plugin.
4.  Enable the plugin in the "Installed plugins" list.
5.  Configure the settings as described above.

### Manual Installation from Source

1.  **Clone the Repository:** Clone this repository into a location of your choice. You can optionally clone it directly into your Obsidian plugins folder:
    ```bash
    cd /path/to/your/vault/.obsidian/plugins/
    git clone https://github.com/ASEM000/atomic-flashcards.git
    cd atomic-flashcards
    ```

2.  **Install Dependencies:** Navigate into the cloned repository's directory in your terminal and install the necessary Node.js dependencies:
    ```bash
    npm install
    ```

3.  **Build the Plugin:** Compile the TypeScript code into JavaScript:
    ```bash
    npm run build
    ```
    This will create the `main.js` file needed by Obsidian.

4.  **(If not cloned directly into plugins folder):** Copy `main.js`, `manifest.json`, and `styles.css` into your Obsidian vault's plugin folder: `YourVault/.obsidian/plugins/atomic-flashcards/`. Create the `atomic-flashcards` folder if it doesn't exist.

5.  **Reload Obsidian:** Open Obsidian and press `Cmd+R` (macOS) or `Ctrl+R` (Windows/Linux) to reload the app.

6.  **Enable Plugin:** Go to Settings -> Community Plugins -> Installed plugins. Find "AI Spaced Repetition Flashcards" and toggle it on.

7.  **Configure:** Go to the plugin settings (Settings -> Community Plugins -> AI Spaced Repetition Flashcards -> Options) and configure your API key and other preferences.
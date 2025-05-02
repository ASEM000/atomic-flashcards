import {
	App,
	Modal,
	Notice,
	Plugin,
	PluginSettingTab,
	Setting,
	TFile,
} from "obsidian";

interface AiSpacedRepetitionSettings {
	openAiApiKey: string;
	modelName: string;
	srSeparator: string;
	srTag: string;
	outputFolderPath: string;
	outputFilenameTemplate: string;
	systemPrompt: string;
}

const DEFAULT_SYSTEM_PROMPT = `You are an expert spaced repetition flashcard creator AI. Your goal is to generate high-quality, insightful flashcards based on the provided notes context. You MUST strictly follow the JSON schema provided below and ALL instructions.

JSON Schema:
{
    "type": "object",
    "properties": {
        "flashcards": {
            "type": "array",
            "items": {
                "type": "object",
                "properties": {
                    "question": {
                        "type": "string",
                        "description": "The question for the flashcard. Should be clear and concise."
                    },
                    "answer": {
                        "type": "string",
                        "description": "The answer to the flashcard. Should be accurate and comprehensive."
                    },
                    "sourceNotePaths": {
                        "type": "array",
                        "items": {
                            "type": "string"
                        },
                        "description": "An array of source note file paths (e.g., 'Folder/My Note.md') from which the information for this flashcard was derived. Use the paths from the --- START/END --- markers."
                    }
                },
                "required": ["question", "answer", "sourceNotePaths"]
            }
        }
    },
    "required": ["flashcards"]
}

{topicPromptSection} {/* Placeholder for optional topic prompt */}

GENERAL INSTRUCTIONS:
1.  For each flashcard, determine which original source note(s) the information came from, using the paths provided in the '--- START: ... ---' markers.
2.  Populate the 'sourceNotePaths' array field in the JSON output with the exact note path(s) identified (e.g., 'Folder/Subfolder/My Note.md').
3.  CRITICAL LaTeX Math Formatting: Use standard LaTeX. STRONGLY PREFER '$...$' for inline equations and '$$...$$' for block equations. DO NOT use '\(...\)' or '\[...\]'. MOST IMPORTANTLY: Ensure backslashes inside the math delimiters are NOT escaped (e.g., write '\epsilon', NOT '\\epsilon').
4.  CRITICAL: Generate questions that DEMAND SYNTHESIS of information across different sections or concepts within the provided notes. DO NOT generate simple recall questions asking for definitions or facts stated directly in a single sentence. Focus on relationships, comparisons, or applications that require understanding multiple points from the context.

Context:
{notesContent}`;

const DEFAULT_SETTINGS: AiSpacedRepetitionSettings = {
	openAiApiKey: "",
	modelName: "gpt-4.1-mini-2025-04-14",
	srSeparator: "?",
	srTag: "#flashcards",
	outputFolderPath: "GeneratedFlashcards",
	outputFilenameTemplate: "flashcards_{{timestamp}}.md",
	systemPrompt: DEFAULT_SYSTEM_PROMPT,
};

interface Flashcard {
	question: string;
	answer: string;
	sourceNotePaths?: string[];
}

export default class AiSpacedRepetitionPlugin extends Plugin {
	settings: AiSpacedRepetitionSettings;

	async onload() {
		await this.loadSettings();

		this.addRibbonIcon(
			"brain-circuit",
			"Generate AI Flashcards",
			(evt: MouseEvent) => {
				new GenerateFlashcardsModal(
					this.app,
					this,
					async (
						tags: string,
						count: number,
						topicPrompt: string,
						folderPath: string,
						statusUpdaterModal: (message: string) => void
					) => {
						return await this.processFlashcardGeneration(
							tags,
							count,
							topicPrompt,
							folderPath,
							statusUpdaterModal
						);
					}
				).open();
			}
		);

		this.addCommand({
			id: "atomic-flashcards",
			name: "Generate Flashcards from Notes",
			callback: async () => {
				const modal = new GenerateFlashcardsModal(
					this.app,
					this,
					async (
						tags: string,
						count: number,
						topicPrompt: string,
						folderPath: string,
						statusUpdaterModal: (message: string) => void
					) => {
						return await this.processFlashcardGeneration(
							tags,
							count,
							topicPrompt,
							folderPath,
							statusUpdaterModal
						);
					}
				);
				modal.open();
			},
		});

		this.addSettingTab(new AiSpacedRepetitionSettingTab(this.app, this));
	}

	async processFlashcardGeneration(
		tagsString: string,
		count: number,
		topicPrompt: string,
		folderPath: string,
		statusUpdater: (message: string) => void
	): Promise<{ success: boolean; filePath: string | null }> {
		statusUpdater("Starting flashcard generation...");

		const tagsToInclude = tagsString
			.split(",")
			.map((t) => t.trim().replace(/^#/, ""))
			.filter((t) => t.length > 0);
		if (tagsToInclude.length === 0) {
			statusUpdater("Error: No valid tags provided.");
			return { success: false, filePath: null };
		}
		if (!this.settings.openAiApiKey) {
			statusUpdater(
				"Error: OpenAI API key not set. Please configure it in the plugin settings."
			);
			return { success: false, filePath: null };
		}

		statusUpdater("Finding notes...");
		const noteData = await this.findNotesByTags(tagsToInclude, folderPath);

		if (!noteData || noteData.includedFiles.length === 0) {
			const searchCriteria = folderPath
				? `in folder '${folderPath}' and `
				: "";
			statusUpdater(
				`No notes found ${searchCriteria}matching tags: [${tagsToInclude.join(
					", "
				)}].`
			);
			return { success: false, filePath: null };
		}

		statusUpdater(
			`Found ${noteData.includedFiles.length} notes. Generating flashcards.`
		);

		const contentForApi = noteData.notesContent;

		const maxContentLength = 10000;
		const contentForApiTruncated =
			contentForApi.length > maxContentLength
				? contentForApi.substring(0, maxContentLength) +
				  "\n\n[Content Truncated]"
				: contentForApi;
		statusUpdater("Calling AI to generate flashcards.");
		const generatedFlashcards = await this.generateSrMarkdownWithApi(
			contentForApiTruncated,
			count,
			statusUpdater,
			topicPrompt
		);

		if (!generatedFlashcards) {
			return { success: false, filePath: null };
		}

		statusUpdater(
			`Generated ${generatedFlashcards.length} flashcards. Formatting and saving.`
		);
		statusUpdater("Saving flashcards to file.");
		const filePath = await this.saveFlashcardsToFile(
			generatedFlashcards,
			tagsToInclude.join(","),
			topicPrompt
		);
		if (!filePath) {
			statusUpdater("Failed to save flashcards file.");
			return { success: false, filePath: null };
		}

		statusUpdater(
			`Successfully saved flashcards to ${filePath}. Opening file.`
		);
		try {
			await this.app.workspace.openLinkText(filePath, "", true);
		} catch (error) {
			console.error("Error opening generated file:", error);
			new Notice(
				`Failed to automatically open ${filePath}. Please navigate to it manually.`
			);
			// Continue even if opening fails, the file was still created.
		}

		statusUpdater(
			`Successfully generated and saved flashcards to ${filePath}.`
		); // Final success message
		return { success: true, filePath: filePath }; // Return the path where the file was saved
	}

	async findNotesByTags(
		tagsToInclude: string[],
		folderPath?: string
	): Promise<{ notesContent: string; includedFiles: TFile[] } | null> {
		const vault = this.app.vault;
		let filesToScan = vault.getMarkdownFiles();

		const normalizedFolderPath = folderPath?.trim().replace(/^\/|\/$/g, "");
		if (normalizedFolderPath && normalizedFolderPath.length > 0) {
			const folderPrefix = normalizedFolderPath + "/";
			filesToScan = filesToScan.filter(
				(file) =>
					file.path.startsWith(folderPrefix) ||
					file.path === normalizedFolderPath
			);
			if (filesToScan.length === 0) {
				new Notice(
					`No markdown files found within the specified folder: '${folderPath}'`
				);
				return null;
			}
		}

		const includedFiles: TFile[] = [];
		let notesContent = "";

		for (const file of filesToScan)
			for (const file of filesToScan) {
				try {
					const fileCache = this.app.metadataCache.getFileCache(file);
					if (!fileCache) continue; // Skip if no cache

					// Get frontmatter tags
					const frontmatterTags = fileCache.frontmatter?.tags;
					let yamlTags: string[] = [];
					if (typeof frontmatterTags === "string") {
						yamlTags = frontmatterTags
							.split(/[\s,]+/) // Split by space OR comma
							.map((t) => t.trim().replace(/^#/, ""))
							.filter((tag) => tag.length > 0); // Also filter empty tags here
					} else if (Array.isArray(frontmatterTags)) {
						yamlTags = frontmatterTags
							.map((t) => String(t).trim().replace(/^#/, ""))
							.filter((tag) => tag.length > 0); // Filter empty tags for arrays too
					}

					const inlineTagObjects = fileCache.tags ?? [];
					const inlineTags = inlineTagObjects.map((t) =>
						t.tag.substring(1)
					);
					const allTags = new Set([...yamlTags, ...inlineTags]);
					const hasAllTags = tagsToInclude.every((reqTag) =>
						allTags.has(reqTag)
					);

					if (hasAllTags) {
						includedFiles.push(file);
						const fileContent = await vault.cachedRead(file);
						notesContent += `--- START: ${file.path} ---\n\n${fileContent}\n\n--- END: ${file.path} ---\n\n`;
					}
				} catch (error) {
					console.error(
						`Error processing file ${file.path} for tags:`,
						error
					);
				}
			}

		if (includedFiles.length === 0) {
			console.log("No notes found matching all required tags.");
			new Notice(
				`No notes found containing all tags: ${tagsToInclude.join(
					", "
				)}`
			);
			return null;
		}

		return { notesContent, includedFiles };
	}

	async generateSrMarkdownWithApi(
		notesContent: string,
		count: number,
		statusUpdater: (message: string) => void,
		topicPrompt?: string
	): Promise<Flashcard[] | null> {
		const { openAiApiKey, modelName, systemPrompt } = this.settings;

		if (!openAiApiKey) {
			throw new Error("OpenAI API key is not set in plugin settings.");
		}

		const topicPromptSection =
			topicPrompt && topicPrompt.trim().length > 0
				? `Topic Focus: Please ensure the flashcards generated are strongly related to the following topic: "${topicPrompt.trim()}".\n\n`
				: "";
		const countInstruction = `Please generate exactly ${count} flashcards based on the provided notes.\n\n`;
		const finalSystemPrompt = systemPrompt
			.replace("{topicPromptSection}", topicPromptSection)
			.replace("{notesContent}", `${countInstruction}${notesContent}`);

		try {
			const response = await fetch(
				"https://api.openai.com/v1/chat/completions",
				{
					method: "POST",
					headers: {
						"Content-Type": "application/json",
						Authorization: `Bearer ${openAiApiKey}`,
					},
					body: JSON.stringify({
						model: modelName,
						messages: [
							{
								role: "system",
								content: finalSystemPrompt,
							},
						],
						temperature: 0.5,
						tools: [
							{
								type: "function",
								function: {
									name: "save_flashcards",
									description:
										"Saves the generated flashcards",
									parameters: {
										type: "object",
										properties: {
											flashcards: {
												type: "array",
												description:
													"An array of flashcard objects.",
												items: {
													type: "object",
													properties: {
														question: {
															type: "string",
															description:
																"The question for the flashcard.",
														},
														answer: {
															type: "string",
															description:
																"The answer to the flashcard question.",
														},
														sourceNotePaths: {
															type: "array",
															description:
																"An array of source note paths (e.g., 'Folder/Note Name.md') used for this flashcard.",
															items: {
																type: "string",
																description:
																	"The path to a source note.",
															},
														},
													},
													required: [
														"question",
														"answer",
														"sourceNotePaths",
													],
												},
											},
										},
										required: ["flashcards"],
									},
								},
							},
						],
						tool_choice: {
							type: "function",
							function: { name: "save_flashcards" },
						},
					}),
				}
			);

			const responseText = await response.text();

			if (response.status !== 200) {
				console.error("OpenAI API Error Status:", response.status);
				console.error("OpenAI API Error Body:", responseText);
				new Notice(
					`OpenAI API Error: ${response.status}. Check console.`
				);
				statusUpdater(`API error: ${response.status}`);
				return null;
			}

			try {
				const outerApiResponse = JSON.parse(responseText);
				const toolCall =
					outerApiResponse.choices?.[0]?.message?.tool_calls?.[0];
				if (
					!toolCall ||
					toolCall.type !== "function" ||
					!toolCall.function ||
					!toolCall.function.arguments
				) {
					console.error(
						"OpenAI API Error: Could not find function arguments in response",
						outerApiResponse
					);
					new Notice(
						"OpenAI API Error: Invalid response format (tool_calls missing). Check console."
					);
					statusUpdater("API response format error.");
					return null;
				}

				const flashcardJsonString = toolCall.function.arguments;
				const parsedFlashcardContent = JSON.parse(flashcardJsonString);
				if (
					!parsedFlashcardContent ||
					!Array.isArray(parsedFlashcardContent.flashcards)
				) {
					console.error(
						"OpenAI API Error: Invalid JSON structure inside content string",
						parsedFlashcardContent
					);
					new Notice(
						"OpenAI API Error: Invalid flashcard JSON structure. Check console."
					);
					statusUpdater("API response invalid (inner structure).");
					return null;
				}

				const validFlashcards =
					parsedFlashcardContent.flashcards.filter(
						(fc: any) =>
							typeof fc.question === "string" &&
							typeof fc.answer === "string" &&
							Array.isArray(fc.sourceNotePaths)
					);

				return validFlashcards;
			} catch (error) {
				console.error("Error parsing API response JSON:", error);
				new Notice("Error parsing API response. Check console.");
				statusUpdater("API response parsing error.");
				return null;
			}
		} catch (error) {
			console.error(
				"Error calling OpenAI API or parsing response:",
				error
			);
			new Notice("Error communicating with OpenAI. Check console.");
			statusUpdater("API call error.");
			return null;
		}
	}

	async saveFlashcardsToFile(
		flashcards: Flashcard[],
		originalTagsString: string,
		topicPrompt?: string
	): Promise<string | null> {
		const { srSeparator, outputFolderPath, outputFilenameTemplate, srTag } =
			this.settings;
		const flashcardBody = flashcards
			.map((card) => {
				let answerWithFootnotes = card.answer;
				if (card.sourceNotePaths && card.sourceNotePaths.length > 0) {
					const footnoteLinks = card.sourceNotePaths
						.map((path) => `^[[[${path}]]]`)
						.join("");
					answerWithFootnotes += `\n${footnoteLinks}`;
				}
				return `**Question:**\n${card.question}\n${srSeparator}\n**Answer:**\n${answerWithFootnotes}`;
			})
			.join("\n\n---\n\n");
		const now = window.moment();
		const formattedTimestamp = now.format("YYYY-MM-DD HH:mm");
		const timestamp = Date.now();
		const cleanedSrTag = srTag.startsWith("#") ? srTag.substring(1) : srTag;
		const originalTagsArray = originalTagsString
			.split(",")
			.map((t) => t.trim())
			.filter((t) => t.length > 0);
		const dateTimeFormatted = now.format("YYYY-MM-DD_HHmmss");
		const generatedTag = `${cleanedSrTag}/atomic-flashcards/${dateTimeFormatted}`;
		const combinedTags = [...new Set([...originalTagsArray, generatedTag])];
		const frontmatter: { [key: string]: any } = {
			tags: combinedTags,
			creation: formattedTimestamp,
		};

		if (topicPrompt && topicPrompt.trim().length > 0) {
			frontmatter["topic"] = topicPrompt.trim();
		}
		let frontmatterString = "---\n";
		frontmatterString += `creation: ${frontmatter.creation}\n`;
		frontmatterString += `tags:\n`;
		frontmatter.tags.forEach((tag: string) => {
			frontmatterString += `  - ${tag}\n`;
		});
		if (frontmatter.topic) {
			frontmatterString += `topic: "${frontmatter.topic}"\n`;
		}
		frontmatterString += "---\n\n";
		const formattedContent = frontmatterString + flashcardBody;
		let filename = outputFilenameTemplate
			.replace("{{timestamp}}", String(timestamp))
			.replace("{{datetime}}", dateTimeFormatted);
		if (!filename.endsWith(".md")) {
			filename += ".md";
		}
		let fullPath = filename;
		if (outputFolderPath) {
			try {
				const folderExists = await this.app.vault.adapter.exists(
					outputFolderPath
				);
				if (!folderExists) {
					await this.app.vault.createFolder(outputFolderPath);
				}
				fullPath = `${outputFolderPath}/${filename}`;
			} catch (error) {
				console.error(
					`Error creating folder '${outputFolderPath}':`,
					error
				);
				fullPath = filename;
				new Notice(
					`Could not create folder '${outputFolderPath}'. Saving to vault root instead.`
				);
			}
		}
		try {
			const fileExists = await this.app.vault.adapter.exists(fullPath);
			if (fileExists) {
				await this.app.vault.adapter.write(fullPath, formattedContent);
			} else {
				await this.app.vault.create(fullPath, formattedContent);
			}
			return fullPath;
		} catch (error) {
			console.error(`Error writing file '${fullPath}':`, error);
			throw new Error(
				`Failed to write flashcards to file: ${error.message}`
			);
		}
	}

	onunload() {
		console.log("Unloading AI Spaced Repetition Plugin");
	}

	async loadSettings() {
		this.settings = Object.assign(
			{},
			DEFAULT_SETTINGS,
			await this.loadData()
		);
	}

	async saveSettings() {
		await this.saveData(this.settings);
	}
}

class AiSpacedRepetitionSettingTab extends PluginSettingTab {
	plugin: AiSpacedRepetitionPlugin;

	constructor(app: App, plugin: AiSpacedRepetitionPlugin) {
		super(app, plugin);
		this.plugin = plugin;
	}

	display(): void {
		const { containerEl } = this;
		containerEl.empty();
		containerEl.createEl("h2", { text: "AI Spaced Repetition Settings" });

		new Setting(containerEl)
			.setName("OpenAI API Key")
			.setDesc("Your secret API key for OpenAI.")
			.addText((text) =>
				text
					.setPlaceholder("Enter your API key")
					.setValue(this.plugin.settings.openAiApiKey)
					.onChange(async (value) => {
						this.plugin.settings.openAiApiKey = value;
						await this.plugin.saveSettings();
					})
			);

		new Setting(containerEl)
			.setName("OpenAI Model Name")
			.setDesc("Model capable of JSON mode (e.g., gpt-4o-mini, gpt-4o).")
			.addText((text) =>
				text
					.setPlaceholder(DEFAULT_SETTINGS.modelName)
					.setValue(this.plugin.settings.modelName)
					.onChange(async (value) => {
						this.plugin.settings.modelName =
							value || DEFAULT_SETTINGS.modelName;
						await this.plugin.saveSettings();
					})
			);

		new Setting(containerEl)
			.setName("SR Separator")
			.setDesc(
				'Separator between question and answer as defined in Obsidian Spaced Repetition Plugin (e.g., "?").'
			)
			.addText((text) =>
				text
					.setPlaceholder(DEFAULT_SETTINGS.srSeparator)
					.setValue(this.plugin.settings.srSeparator)
					.onChange(async (value) => {
						this.plugin.settings.srSeparator =
							value.trim() || DEFAULT_SETTINGS.srSeparator;
						await this.plugin.saveSettings();
					})
			);

		new Setting(containerEl)
			.setName("Spaced Repetition Tag")
			.setDesc(
				"Primary tag added to all generated flashcard notes (e.g., #flashcards, flashcards/generated)."
			)
			.addText((text) =>
				text
					.setPlaceholder(DEFAULT_SETTINGS.srTag)
					.setValue(this.plugin.settings.srTag)
					.onChange(async (value) => {
						let tagValue = value.trim();
						if (!tagValue) {
							tagValue = DEFAULT_SETTINGS.srTag;
						}
						this.plugin.settings.srTag = tagValue;
						await this.plugin.saveSettings();
					})
			);

		new Setting(containerEl)
			.setName("Output Folder Path")
			.setDesc(
				"Folder to save generated files (relative to vault root). Leave blank for vault root."
			)
			.addText((text) =>
				text
					.setPlaceholder("GeneratedFlashcards (optional)")
					.setValue(this.plugin.settings.outputFolderPath)
					.onChange(async (value) => {
						this.plugin.settings.outputFolderPath = value
							.trim()
							.replace(/^\/|\/$/g, ""); // Remove leading/trailing slashes
						await this.plugin.saveSettings();
					})
			);

		new Setting(containerEl)
			.setName("Output Filename Template")
			.setDesc("Filename template. Use {{timestamp}}.")
			.addText((text) =>
				text
					.setPlaceholder(DEFAULT_SETTINGS.outputFilenameTemplate)
					.setValue(this.plugin.settings.outputFilenameTemplate)
					.onChange(async (value) => {
						this.plugin.settings.outputFilenameTemplate =
							value || DEFAULT_SETTINGS.outputFilenameTemplate;
						await this.plugin.saveSettings();
					})
			);

		const systemPromptSetting = new Setting(containerEl).setName(
			"System Prompt Template"
		);
		const descFragment = document.createDocumentFragment();
		descFragment.appendText(
			"The template for the prompt sent to the AI. Use "
		);
		descFragment.createEl("code", { text: "{topicPromptSection}" });
		descFragment.appendText(" (optional, based on modal input) and ");
		descFragment.createEl("code", { text: "{notesContent}" });
		descFragment.appendText(" placeholders.");
		systemPromptSetting.setDesc(descFragment);
		systemPromptSetting.addTextArea((text) =>
			text
				.setPlaceholder(DEFAULT_SYSTEM_PROMPT)
				.setValue(this.plugin.settings.systemPrompt)
				.onChange(async (value) => {
					this.plugin.settings.systemPrompt =
						value || DEFAULT_SYSTEM_PROMPT;
					await this.plugin.saveSettings();
				})
				.inputEl.setAttrs({ rows: 15, style: "width: 100%;" })
		);
	}
}

class GenerateFlashcardsModal extends Modal {
	plugin: AiSpacedRepetitionPlugin;
	onSubmit: (
		tags: string,
		count: number,
		topicPrompt: string,
		folderPath: string,
		statusUpdater: (message: string) => void
	) => Promise<{ success: boolean; filePath: string | null }>;
	tags: string = "";
	count: number = 10;
	topicPrompt: string = "";
	folderPath: string = "";

	private statusDiv: HTMLDivElement | null = null;
	private generateButton: HTMLButtonElement | null = null;
	private tagInput: HTMLInputElement | null = null;
	private countInput: HTMLInputElement | null = null;
	private topicPromptInput: HTMLTextAreaElement | null = null;
	private folderPathInput: HTMLInputElement | null = null;

	constructor(
		app: App,
		plugin: AiSpacedRepetitionPlugin,
		onSubmit: (
			tags: string,
			count: number,
			topicPrompt: string,
			folderPath: string,
			statusUpdater: (message: string) => void
		) => Promise<{ success: boolean; filePath: string | null }>
	) {
		super(app);
		this.plugin = plugin;
		this.onSubmit = onSubmit;
	}

	onOpen() {
		const { contentEl } = this;
		contentEl.empty();
		contentEl.createEl("h2", { text: "Generate Flashcards" });

		// Tags Input
		new Setting(contentEl)
			.setName("Tags to Include")
			.setDesc(
				"Comma or space-separated tags (no # prefix). Notes must contain ALL listed tags."
			)
			.addText((text) => {
				text.setPlaceholder("e.g., important chapter5 concept")
					.setValue(this.tags)
					.onChange((value) => {
						this.tags = value;
					});
				text.inputEl.style.width = "100%";
				this.tagInput = text.inputEl;
			});

		new Setting(contentEl)
			.setName("Folder Path (Optional)")
			.setDesc(
				'Generate flashcards only from notes within this folder (relative to vault root, e.g., "School/Math"). Leave blank to search the entire vault.'
			)
			.addText((text) => {
				text.setPlaceholder("Enter folder path...")
					.setValue(this.folderPath)
					.onChange((value) => {
						this.folderPath = value;
					});
				text.inputEl.style.width = "100%";
				this.folderPathInput = text.inputEl;
			});

		new Setting(contentEl)
			.setName("Topic Prompt (Optional)")
			.setDesc(
				"Focus flashcard generation on a specific theme within the tagged notes."
			)
			.addTextArea((text) => {
				text.setPlaceholder("e.g., Eigenvalue relationship to PSD")
					.setValue(this.topicPrompt)
					.onChange((value) => {
						this.topicPrompt = value;
					});
				text.inputEl.style.width = "100%";
				text.inputEl.style.minHeight = "4em";
				this.topicPromptInput = text.inputEl;
			});

		new Setting(contentEl)
			.setName("Number of Flashcards")
			.setDesc("How many flashcards to request?")
			.addText((text) => {
				text.setPlaceholder("10")
					.setValue(String(this.count))
					.onChange((value) => {
						const num = parseInt(value, 10);
						this.count = isNaN(num) || num < 1 ? 1 : num;
						text.setValue(String(this.count));
					});
				text.inputEl.setAttribute("type", "number");
				text.inputEl.setAttribute("min", "1");
				this.countInput = text.inputEl;
			});

		this.statusDiv = contentEl.createEl("div", {
			cls: "ai-sr-status-area",
		});
		this.statusDiv.style.marginTop = "10px";
		this.statusDiv.style.minHeight = "2em";
		this.statusDiv.style.border =
			"1px solid var(--background-modifier-border)";
		this.statusDiv.style.padding = "5px";
		this.statusDiv.setText("Enter tags and click Generate.");

		const buttonContainer = new Setting(contentEl).setClass(
			"ai-sr-button-container"
		);

		buttonContainer.addButton((button) => {
			button
				.setButtonText("Generate Flashcards")
				.setCta()
				.onClick(async () => {
					if (this.tagInput) this.tagInput.disabled = true;
					if (this.countInput) this.countInput.disabled = true;
					if (this.topicPromptInput)
						this.topicPromptInput.disabled = true;
					if (this.folderPathInput)
						this.folderPathInput.disabled = true;
					if (this.generateButton)
						this.generateButton.disabled = true;

					this.updateStatus("Starting generation...");

					const cleanedTags = this.tags
						.split(/[\s,]+/)
						.map((tag) => tag.trim().replace(/^#/, ""))
						.filter((tag) => tag.length > 0)
						.join(",");

					if (!cleanedTags) {
						this.updateStatus(
							"Error: Please enter at least one valid tag."
						);
						if (this.tagInput) this.tagInput.disabled = false;
						if (this.countInput) this.countInput.disabled = false;
						if (this.topicPromptInput)
							this.topicPromptInput.disabled = false;
						if (this.folderPathInput)
							this.folderPathInput.disabled = false;
						if (this.generateButton)
							this.generateButton.disabled = false;
						return;
					}

					const finalCount = Math.max(1, this.count);
					const finalTopicPrompt = this.topicPrompt.trim();
					const finalFolderPath = this.folderPath.trim();

					try {
						const result = await this.onSubmit(
							cleanedTags,
							finalCount,
							finalTopicPrompt,
							finalFolderPath,
							this.updateStatus.bind(this)
						);

						if (result.success) {
							this.updateStatus("Generation successful!");
						}
					} catch (error: any) {
						console.error(
							"Error during modal onSubmit call:",
							error
						);
						this.updateStatus(
							`Error: ${error.message}. Check console.`
						);
					} finally {
						if (this.tagInput) this.tagInput.disabled = false;
						if (this.countInput) this.countInput.disabled = false;
						if (this.topicPromptInput)
							this.topicPromptInput.disabled = false;
						if (this.folderPathInput)
							this.folderPathInput.disabled = false;
						if (this.generateButton)
							this.generateButton.disabled = false;
					}
				});
			button.buttonEl;
			this.generateButton = button.buttonEl;
		});
	}

	private updateStatus(message: string): void {
		if (this.statusDiv) {
			this.statusDiv.setText(message.replace(/\n/g, " "));
		}
		console.log("Modal Status Update:", message);
	}

	onClose() {
		const { contentEl } = this;
		contentEl.empty();
	}
}

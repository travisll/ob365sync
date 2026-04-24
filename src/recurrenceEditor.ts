import { Notice, Setting } from "obsidian";
import {
  DAYS_OF_WEEK,
  RECURRENCE_INDEXES,
  buildRecurrenceFromForm,
  recurrenceSummary,
  requiresDayOfMonth,
  requiresDaysOfWeek,
  requiresIndex,
  requiresMonth,
  type RecurrenceFormState,
} from "./recurrence";

interface RecurrenceEditorOptions {
  containerEl: HTMLElement;
  state: RecurrenceFormState;
  title?: string;
  saveLabel?: string;
  onStateChange: (state: RecurrenceFormState) => void;
  onSave: (nextRecurrence: string) => Promise<void>;
  onCancel?: () => void;
}

export function renderRecurrenceEditor(options: RecurrenceEditorOptions): void {
  const {
    containerEl,
    state,
    title,
    saveLabel = "Save",
    onStateChange,
    onSave,
    onCancel,
  } = options;

  containerEl.empty();

  if (title) {
    containerEl.createEl("h3", { text: title });
  }

  const recurrence = buildRecurrenceFromForm(state);
  containerEl.createEl("p", {
    text: recurrenceSummary(recurrence ? JSON.stringify(recurrence) : ""),
    cls: "office365-recurrence-summary",
  });

  new Setting(containerEl)
    .setName("Repeats")
    .setDesc("Turn recurrence on or off for this note.")
    .addToggle((toggle) =>
      toggle.setValue(state.enabled).onChange((value) => {
        onStateChange({
          ...state,
          enabled: value,
        });
      }),
    );

  if (state.enabled) {
    new Setting(containerEl)
      .setName("Pattern")
      .addDropdown((dropdown) =>
        dropdown
          .addOption("daily", "Daily")
          .addOption("weekly", "Weekly")
          .addOption("absoluteMonthly", "Monthly (day of month)")
          .addOption("relativeMonthly", "Monthly (weekday pattern)")
          .addOption("absoluteYearly", "Yearly (date)")
          .addOption("relativeYearly", "Yearly (weekday pattern)")
          .setValue(state.patternType)
          .onChange((value) => {
            onStateChange({
              ...state,
              patternType: value as RecurrenceFormState["patternType"],
            });
          }),
      );

    new Setting(containerEl)
      .setName("Interval")
      .addText((text) =>
        text.setValue(String(state.interval)).onChange((value) => {
          onStateChange({
            ...state,
            interval: Math.max(1, Number.parseInt(value || "1", 10) || 1),
          });
        }),
      );

    new Setting(containerEl)
      .setName("Starts")
      .setDesc("Date the recurrence range begins.")
      .addText((text) =>
        text.setPlaceholder("YYYY-MM-DD").setValue(state.startDate).onChange((value) => {
          onStateChange({
            ...state,
            startDate: value.trim(),
          });
        }),
      );

    if (requiresDaysOfWeek(state.patternType)) {
      const daysContainer = containerEl.createDiv({
        cls: "office365-days-of-week",
      });
      daysContainer.createEl("p", { text: "Days of week" });

      for (const day of DAYS_OF_WEEK) {
        new Setting(daysContainer)
          .setName(capitalize(day))
          .addToggle((toggle) =>
            toggle.setValue(state.daysOfWeek.includes(day)).onChange((value) => {
              onStateChange({
                ...state,
                daysOfWeek: value
                  ? [...new Set([...state.daysOfWeek, day])]
                  : state.daysOfWeek.filter((existing) => existing !== day),
              });
            }),
          );
      }

      new Setting(containerEl)
        .setName("First day of week")
        .addDropdown((dropdown) => {
          for (const day of DAYS_OF_WEEK) {
            dropdown.addOption(day, capitalize(day));
          }
          dropdown.setValue(state.firstDayOfWeek).onChange((value) => {
            onStateChange({
              ...state,
              firstDayOfWeek: value,
            });
          });
        });
    }

    if (requiresDayOfMonth(state.patternType)) {
      new Setting(containerEl)
        .setName("Day of month")
        .addText((text) =>
          text.setValue(String(state.dayOfMonth)).onChange((value) => {
            onStateChange({
              ...state,
              dayOfMonth: Math.max(1, Number.parseInt(value || "1", 10) || 1),
            });
          }),
        );
    }

    if (requiresMonth(state.patternType)) {
      new Setting(containerEl)
        .setName("Month")
        .addText((text) =>
          text.setValue(String(state.month)).onChange((value) => {
            onStateChange({
              ...state,
              month: Math.max(1, Math.min(12, Number.parseInt(value || "1", 10) || 1)),
            });
          }),
        );
    }

    if (requiresIndex(state.patternType)) {
      new Setting(containerEl)
        .setName("Index")
        .addDropdown((dropdown) => {
          for (const index of RECURRENCE_INDEXES) {
            dropdown.addOption(index, capitalize(index));
          }
          dropdown.setValue(state.index).onChange((value) => {
            onStateChange({
              ...state,
              index: value,
            });
          });
        });
    }

    new Setting(containerEl)
      .setName("Range")
      .addDropdown((dropdown) =>
        dropdown
          .addOption("noEnd", "No end date")
          .addOption("endDate", "End by date")
          .addOption("numbered", "End after count")
          .setValue(state.rangeType)
          .onChange((value) => {
            onStateChange({
              ...state,
              rangeType: value as RecurrenceFormState["rangeType"],
            });
          }),
      );

    if (state.rangeType === "endDate") {
      new Setting(containerEl)
        .setName("End date")
        .addText((text) =>
          text.setPlaceholder("YYYY-MM-DD").setValue(state.endDate).onChange((value) => {
            onStateChange({
              ...state,
              endDate: value.trim(),
            });
          }),
        );
    }

    if (state.rangeType === "numbered") {
      new Setting(containerEl)
        .setName("Occurrences")
        .addText((text) =>
          text.setValue(String(state.numberOfOccurrences)).onChange((value) => {
            onStateChange({
              ...state,
              numberOfOccurrences: Math.max(1, Number.parseInt(value || "1", 10) || 1),
            });
          }),
        );
    }
  }

  new Setting(containerEl)
    .setClass("office365-recurrence-actions")
    .addButton((button) =>
      button.setButtonText(saveLabel).setCta().onClick(async () => {
        const nextRecurrence = buildRecurrenceFromForm(state);
        if (state.enabled && !state.startDate) {
          new Notice("Recurring events need a recurrence start date.");
          return;
        }

        await onSave(nextRecurrence ? JSON.stringify(nextRecurrence) : "");
      }),
    )
    .addButton((button) =>
      button.setButtonText("Disable recurrence").onClick(async () => {
        onStateChange({
          ...state,
          enabled: false,
        });
        await onSave("");
      }),
    );

  if (onCancel) {
    new Setting(containerEl).addButton((button) =>
      button.setButtonText("Cancel").onClick(() => {
        onCancel();
      }),
    );
  }
}

function capitalize(value: string): string {
  return value.charAt(0).toUpperCase() + value.slice(1);
}

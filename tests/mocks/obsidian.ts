export class TFile {
  path: string;
  basename: string;
  stat: { mtime: number };

  constructor(path: string, mtime = 0) {
    this.path = normalizePath(path);
    this.basename = this.path.split("/").pop()?.replace(/\.md$/, "") ?? "";
    this.stat = { mtime };
  }
}

export class TFolder {
  path: string;

  constructor(path: string) {
    this.path = normalizePath(path);
  }
}

export class Notice {
  constructor(_message: string, _timeout?: number) {}
}

export class Vault {}

export class Plugin {}
export class Modal {
  app: unknown;
  contentEl = {
    empty() {},
    createEl() {
      return undefined;
    },
    createDiv() {
      return {
        createEl() {
          return undefined;
        },
      };
    },
  };
  constructor(app: unknown) {
    this.app = app;
  }
  setTitle(_title: string) {}
  open() {}
  close() {}
}
export class App {}
export class PluginSettingTab {
  app: unknown;
  plugin: unknown;
  containerEl = {
    empty() {},
    createEl() {
      return undefined;
    },
  };
  constructor(app: unknown, plugin: unknown) {
    this.app = app;
    this.plugin = plugin;
  }
}
export class Setting {
  constructor(_el: unknown) {}
  setName(_value: string) {
    return this;
  }
  setDesc(_value: string) {
    return this;
  }
  addText(cb: (component: MockTextComponent) => void) {
    cb(new MockTextComponent());
    return this;
  }
  addToggle(cb: (component: MockToggleComponent) => void) {
    cb(new MockToggleComponent());
    return this;
  }
  addButton(cb: (component: MockButtonComponent) => void) {
    cb(new MockButtonComponent());
    return this;
  }
  addDropdown(cb: (component: MockDropdownComponent) => void) {
    cb(new MockDropdownComponent());
    return this;
  }
}
export class MarkdownView {
  file?: TFile;
}

class MockTextComponent {
  setPlaceholder(_value: string) {
    return this;
  }
  setValue(_value: string) {
    return this;
  }
  onChange(_cb: (value: string) => void) {
    return this;
  }
}

class MockToggleComponent {
  setValue(_value: boolean) {
    return this;
  }
  onChange(_cb: (value: boolean) => void) {
    return this;
  }
}

class MockButtonComponent {
  setButtonText(_value: string) {
    return this;
  }
  setWarning() {
    return this;
  }
  setCta() {
    return this;
  }
  onClick(_cb: () => void | Promise<void>) {
    return this;
  }
}

class MockDropdownComponent {
  addOption(_value: string, _label: string) {
    return this;
  }
  setValue(_value: string) {
    return this;
  }
  onChange(_cb: (value: string) => void) {
    return this;
  }
}

export function normalizePath(path: string): string {
  return path.replace(/\\/g, "/").replace(/\/+/g, "/").replace(/\/$/, "");
}

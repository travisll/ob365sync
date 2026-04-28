# Changelog

All notable changes to this project will be documented in this file.

The format is based on Keep a Changelog, and this project follows Semantic Versioning where practical.

## [0.2.0] - 2026-04-24

### Added

- Two-way Office 365 calendar sync scaffold for Obsidian
- Microsoft Graph device-code authentication
- Delta sync support for incremental calendar updates
- Recurrence support for series masters, occurrences, and exceptions
- Sidebar view for event editing inside Obsidian
- Inline editing for recurrence, title, dates, attendees, and sync/delete actions
- Archive-and-delete flow for remote event deletion after local note deletion
- Automated tests for sync helpers and recurrence handling
- Release packaging script and GitHub Actions workflows

### Changed

- Improved repository metadata and documentation for plugin-style distribution
- Updated manifest and package metadata to reflect the GitHub repository and maintainer

## [0.1.0] - 2026-04-23

### Added

- Initial MVP scaffold for Office 365 calendar sync
- Basic sync engine, Graph client, settings tab, and release bundle generation

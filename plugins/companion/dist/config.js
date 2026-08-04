export function getConfigFields() {
    return [
        {
            type: 'textinput',
            id: 'serverUrl',
            label: 'Server URL',
            width: 8,
            default: 'https://easyprompter.com',
        },
        {
            type: 'secret-text',
            id: 'apiKey',
            label: 'Integration Key',
            width: 12,
        },
    ];
}
//# sourceMappingURL=config.js.map
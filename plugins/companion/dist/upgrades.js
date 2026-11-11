const LEGACY_DEFAULT_SERVER_URL = 'https://app.easyprompter.com';
const DEFAULT_SERVER_URL = 'https://easyprompter.com';
const migrateLegacyDefaults = (_context, props) => {
    const updatedConfig = props.config?.serverUrl === LEGACY_DEFAULT_SERVER_URL ? { ...props.config, serverUrl: DEFAULT_SERVER_URL } : null;
    const updatedActions = props.actions
        .filter((action) => (action.actionId === 'fast_forward_start' || action.actionId === 'rewind_start') && 'rate' in action.options)
        .map((action) => {
        const options = { ...action.options };
        delete options.rate;
        return { ...action, options };
    });
    return {
        updatedConfig,
        updatedActions,
        updatedFeedbacks: [],
    };
};
export const UpgradeScripts = [migrateLegacyDefaults];
//# sourceMappingURL=upgrades.js.map
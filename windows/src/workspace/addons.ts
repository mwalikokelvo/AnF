// Windows: themes are fetched and checked by Rust (addons.rs) through Tauri commands.
import {invoke} from '@tauri-apps/api/core';
import {createMarketplace,type Call} from './addons-core';
export const {applyTheme,clearTheme,restoreTheme,marketplacePanel}=createMarketplace(invoke as Call);

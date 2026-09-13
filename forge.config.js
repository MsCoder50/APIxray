const { FusesPlugin } = require('@electron-forge/plugin-fuses');
const { FuseV1Options, FuseVersion } = require('@electron/fuses');

module.exports = {
  packagerConfig: {
    asar: true,
    icon: './src/assets/images/icon',
    extraResource: [
      './src/assets/images/icon.png',
      './src/assets/images/icon.ico'
    ]
  },
  rebuildConfig: {},
  makers: [
    {
      name: '@electron-forge/maker-squirrel',
      config: {},
      platforms: ['win32'],
    },
    {
      name: '@electron-forge/maker-zip',
      platforms: ['darwin', 'win32'],
    },
    {
      name: '@electron-forge/maker-deb',
      config: {
        options: {
          icon: './src/assets/images/icon.png'
        }
      },
    }
  ],
  plugins: [
    {
      name: '@electron-forge/plugin-vite',
      config: {
        // `build` can specify multiple entry builds, which can be Main process, Preload scripts, Worker process, etc.
        // If you are familiar with Vite configuration, it will look really familiar.
        build: [
          {
            // `entry` is just an alias for `build.lib.entry` in the corresponding file of `config`.
            entry: 'src/main.js',
            config: 'vite.main.config.mjs',
            target: 'main',
          },
          {
            entry: 'src/preload.js',
            config: 'vite.preload.config.mjs',
            target: 'preload',
          },
        ],
        renderer: [
          {
            name: 'main_window',
            config: 'vite.renderer.config.mjs',
          },
        ],
      },
    },
    // Fuses are used to enable/disable various Electron functionality
    // at package time, before code signing the application
    new FusesPlugin({
      version: FuseVersion.V1,
      [FuseV1Options.RunAsNode]: false,
      [FuseV1Options.EnableCookieEncryption]: true,
      [FuseV1Options.EnableNodeOptionsEnvironmentVariable]: false,
      [FuseV1Options.EnableNodeCliInspectArguments]: false,
      [FuseV1Options.EnableEmbeddedAsarIntegrityValidation]: false,
      [FuseV1Options.OnlyLoadAppFromAsar]: true,
    }),
  ],
  hooks: {
    postPackage: async (forgeConfig, options) => {
      try {
        const { load } = require('resedit/cjs');
        const fs = require('fs-extra');
        const path = require('path');
        for (const outputPath of options.outputPaths) {
          const exePath = path.join(outputPath, 'APIxray.exe');
          const iconPath = path.resolve('src/assets/images/icon.ico');
          if (await fs.pathExists(exePath) && await fs.pathExists(iconPath)) {
            const resedit = await load();
            const exeData = await fs.readFile(exePath);
            const exe = resedit.NtExecutable.from(exeData);
            const res = resedit.NtExecutableResource.from(exe);
            const existingIconGroups = resedit.Resource.IconGroupEntry.fromEntries(res.entries);
            if (existingIconGroups.length > 0) {
              const iconFile = resedit.Data.IconFile.from(await fs.readFile(iconPath));
              resedit.Resource.IconGroupEntry.replaceIconsForResource(
                res.entries,
                existingIconGroups[0].id,
                existingIconGroups[0].lang,
                iconFile.icons.map((item) => item.data)
              );
              res.outputResource(exe);
              await fs.writeFile(exePath, Buffer.from(exe.generate()));
            }
          }
        }
      } catch (err) {
        console.warn('Could not post-patch executable icon:', err.message);
      }
    },
  },
};

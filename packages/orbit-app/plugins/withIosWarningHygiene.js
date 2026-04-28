const fs = require('node:fs');
const path = require('node:path');
const { withDangerousMod, withXcodeProject } = require('@expo/config-plugins');

const PODFILE_MARKER = '# BEGIN ORBIT IOS WARNING HYGIENE';

function addPodfileWarningHygiene(podfile) {
    let nextPodfile = podfile;

    if (!nextPodfile.includes('minimum_ios_deployment_target =')) {
        nextPodfile = nextPodfile.replace(
            /(platform :ios, podfile_properties\['ios\.deploymentTarget'\] \|\| '15\.1'\n)/,
            "$1minimum_ios_deployment_target = podfile_properties['ios.deploymentTarget'] || '15.1'\n"
        );
    }

    if (nextPodfile.includes(PODFILE_MARKER)) {
        return nextPodfile;
    }

    const hygieneBlock = `

    ${PODFILE_MARKER}
    # Keep generated Pods, including resource bundles, aligned with the app's
    # deployment target so newer Xcode versions do not surface noisy warnings.
    installer.pods_project.targets.each do |target|
      target.build_configurations.each do |build_config|
        current_target = build_config.build_settings['IPHONEOS_DEPLOYMENT_TARGET']
        next if current_target && Gem::Version.new(current_target) >= Gem::Version.new(minimum_ios_deployment_target)

        build_config.build_settings['IPHONEOS_DEPLOYMENT_TARGET'] = minimum_ios_deployment_target
      end
    end
    # END ORBIT IOS WARNING HYGIENE
`;

    return nextPodfile.replace(
        /(    react_native_post_install\([\s\S]*?\n    \)\n)/,
        `$1${hygieneBlock}`
    );
}

function markIntentionalAlwaysRunScript(project) {
    const scripts = project.hash.project.objects.PBXShellScriptBuildPhase || {};

    for (const script of Object.values(scripts)) {
        if (!script || typeof script !== 'object') {
            continue;
        }

        const scriptName = String(script.name || '');
        if (scriptName.includes('[Expo Dev Launcher] Strip Local Network Keys for Release')) {
            script.alwaysOutOfDate = '1';
        }
    }
}

const withIosWarningHygiene = (config) => {
    config = withDangerousMod(config, [
        'ios',
        async (modConfig) => {
            const podfilePath = path.join(modConfig.modRequest.platformProjectRoot, 'Podfile');
            const podfile = fs.readFileSync(podfilePath, 'utf8');
            fs.writeFileSync(podfilePath, addPodfileWarningHygiene(podfile));
            return modConfig;
        },
    ]);

    return withXcodeProject(config, (modConfig) => {
        markIntentionalAlwaysRunScript(modConfig.modResults);
        return modConfig;
    });
};

module.exports = withIosWarningHygiene;

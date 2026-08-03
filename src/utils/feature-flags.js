/**

 * Feature / display flags derived from settings.

 * Tags show when Debut_mode=1 OR user toggles show_tags_always.

 * @param {Record<string, string>|null|undefined} settings

 * @returns {boolean}

 */

export function shouldShowTags(settings) {

  if (!settings) return false;

  return (

    String(settings.Debut_mode) === '1' ||

    settings.show_tags_always === 'true' ||

    settings.show_tags_always === true

  );

}



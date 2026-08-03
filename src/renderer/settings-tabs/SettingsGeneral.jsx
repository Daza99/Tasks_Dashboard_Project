import React, { useState, useEffect } from 'react';

import { useDatabase } from '../context/DatabaseContext';



/** General prefs: display name, snooze default, tag visibility. */

export default function SettingsGeneral() {

  const { settings, updateSetting } = useDatabase();

  const [name, setName] = useState(settings?.display_name || '');

  const [snoozeMins, setSnoozeMins] = useState(

    settings?.notif_default_snooze_minutes || '10'

  );

  const [showTags, setShowTags] = useState(settings?.show_tags_always === 'true');

  const [debutMode, setDebutMode] = useState(String(settings?.Debut_mode) === '1');



  useEffect(() => {

    setName(settings?.display_name || '');

    setSnoozeMins(settings?.notif_default_snooze_minutes || '10');

    setShowTags(settings?.show_tags_always === 'true');

    setDebutMode(String(settings?.Debut_mode) === '1');

  }, [settings]);



  async function save() {

    const mins = Math.max(1, Number(snoozeMins) || 10);

    await updateSetting('display_name', name);

    await updateSetting('notif_default_snooze_minutes', String(mins));

    await updateSetting('show_tags_always', showTags ? 'true' : 'false');

    await updateSetting('Debut_mode', debutMode ? '1' : '0');

  }



  return (

    <div>

      <div className="settings-field">

        <label htmlFor="display-name">Display name</label>

        <input

          id="display-name"

          type="text"

          value={name}

          onChange={(e) => setName(e.target.value)}

          placeholder="Your name"

        />

      </div>



      <div className="settings-field">

        <label htmlFor="snooze-mins">Default snooze (minutes)</label>

        <input

          id="snooze-mins"

          type="number"

          min={1}

          value={snoozeMins}

          onChange={(e) => setSnoozeMins(e.target.value)}

        />

      </div>



      <div className="settings-field settings-field--check">

        <label>

          <input

            type="checkbox"

            checked={showTags}

            onChange={(e) => setShowTags(e.target.checked)}

          />{' '}

          Show tags always (Expired / lists)

        </label>

      </div>



      <div className="settings-field settings-field--check">

        <label>

          <input

            type="checkbox"

            checked={debutMode}

            onChange={(e) => setDebutMode(e.target.checked)}

          />{' '}

          Debut mode (force show tags while testing)

        </label>

      </div>



      <button type="button" className="btn-primary" onClick={save}>

        Save

      </button>

    </div>

  );

}



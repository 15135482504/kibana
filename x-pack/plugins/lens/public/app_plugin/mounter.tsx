/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License;
 * you may not use this file except in compliance with the Elastic License.
 */
import React from 'react';

import { AppMountParameters, CoreSetup } from 'kibana/public';
import { FormattedMessage, I18nProvider } from '@kbn/i18n/react';
import { HashRouter, Route, RouteComponentProps, Switch } from 'react-router-dom';
import { render, unmountComponentAtNode } from 'react-dom';
import { i18n } from '@kbn/i18n';
import { parse } from 'query-string';

import { removeQueryParam, Storage } from '../../../../../src/plugins/kibana_utils/public';

import { LensReportManager, setReportManager, trackUiEvent } from '../lens_ui_telemetry';

import { App } from './app';
import { EditorFrameStart } from '../types';
import { addHelpMenuToAppChrome } from '../help_menu_util';
import { SavedObjectIndexStore } from '../persistence';
import { LensPluginStartDependencies } from '../plugin';
import { LENS_EMBEDDABLE_TYPE } from '../../common';

export async function mountApp(
  core: CoreSetup<LensPluginStartDependencies, void>,
  params: AppMountParameters,
  createEditorFrame: EditorFrameStart['createInstance']
) {
  const [coreStart, startDependencies] = await core.getStartServices();
  const { data: dataStart, navigation } = startDependencies;
  const savedObjectsClient = coreStart.savedObjects.client;
  addHelpMenuToAppChrome(coreStart.chrome, coreStart.docLinks);

  coreStart.chrome.docTitle.change(
    i18n.translate('xpack.lens.pageTitle', { defaultMessage: 'Lens' })
  );

  const instance = await createEditorFrame();

  setReportManager(
    new LensReportManager({
      storage: new Storage(localStorage),
      http: core.http,
    })
  );
  const redirectTo = (
    routeProps: RouteComponentProps<{ id?: string }>,
    id?: string,
    returnToOrigin?: boolean,
    originatingApp?: string,
    newlyCreated?: boolean
  ) => {
    if (!id) {
      routeProps.history.push('/');
    } else if (!originatingApp) {
      routeProps.history.push(`/edit/${id}`);
    } else if (!!originatingApp && id && returnToOrigin) {
      routeProps.history.push(`/edit/${id}`);

      if (originatingApp === 'dashboards') {
        const addLensId = newlyCreated ? id : '';
        startDependencies.dashboard.addEmbeddableToDashboard({
          embeddableId: addLensId,
          embeddableType: LENS_EMBEDDABLE_TYPE,
        });
      } else {
        coreStart.application.navigateToApp(originatingApp);
      }
    }
  };

  const renderEditor = (routeProps: RouteComponentProps<{ id?: string }>) => {
    trackUiEvent('loaded');
    const urlParams = parse(routeProps.location.search) as Record<string, string>;
    const originatingAppFromUrl = urlParams.embeddableOriginatingApp;
    if (urlParams.embeddableOriginatingApp) {
      removeQueryParam(routeProps.history, 'embeddableOriginatingApp');
    }

    return (
      <App
        core={coreStart}
        data={dataStart}
        navigation={navigation}
        editorFrame={instance}
        storage={new Storage(localStorage)}
        docId={routeProps.match.params.id}
        docStorage={new SavedObjectIndexStore(savedObjectsClient)}
        redirectTo={(id, returnToOrigin, originatingApp, newlyCreated) =>
          redirectTo(routeProps, id, returnToOrigin, originatingApp, newlyCreated)
        }
        originatingAppFromUrl={originatingAppFromUrl}
      />
    );
  };

  function NotFound() {
    trackUiEvent('loaded_404');
    return <FormattedMessage id="xpack.lens.app404" defaultMessage="404 Not Found" />;
  }

  params.element.classList.add('lnsAppWrapper');
  render(
    <I18nProvider>
      <HashRouter>
        <Switch>
          <Route exact path="/edit/:id" render={renderEditor} />
          <Route exact path="/" render={renderEditor} />
          <Route path="/" component={NotFound} />
        </Switch>
      </HashRouter>
    </I18nProvider>,
    params.element
  );
  return () => {
    instance.unmount();
    unmountComponentAtNode(params.element);
  };
}

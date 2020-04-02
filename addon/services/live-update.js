import Service from '@ember/service';
import { A, isArray } from '@ember/array'
import { later } from '@ember/runloop';
import { inject as service } from '@ember/service';
import fetch from 'fetch'
import { task } from 'ember-concurrency';
import { tracked } from '@glimmer/tracking';

export default class LiveUpdateService extends Service {
  @service store;

  @tracked monitoredResources = null;
  defaultPollInterval = 4000;

  constructor () {
    super(...arguments);
    this.monitoredResources = A([]);
    this.lifecycle();
  }

  async findAll (type) {
    const monitoredResource = this.register(this.pollAll, [type]);
    const resource = await this.pollResource.perform(monitoredResource);
    return resource;
  }

  async pollAll (modelName) {
    const url = this.store.adapterFor(modelName).urlForFindAll(...arguments);
    return this.poll(modelName, url);
  }

  async findRecord (type, id) {
    const monitoredResource = this.register(this.pollRecord, [id, type]);
    const resource = await this.pollResource.perform(monitoredResource);
    return resource;
  }

  async pollRecord (id, modelName) {
    const url = this.store.adapterFor(modelName).urlForFindRecord(...arguments);
    return this.poll(modelName, url);
  }

  async query (type, query) {
    const monitoredResource = this.register(this.pollQuery, [query, type]);
    const resource = await this.pollResource.perform(monitoredResource);
    return resource;
  }

  async pollQuery (query, modelName) {
    const adapter = this.store.adapterFor(modelName);
    const path = adapter.urlForQuery(...arguments); // Doesn't take care of query params. See https://github.com/emberjs/data/issues/3895
    const params = new URLSearchParams(Object.entries(query)); // Nested query params not allowed
    const url = new URL(path, adapter.host || window.location.origin);
    url.search = params.toString();
    return this.poll(modelName, url);
  }

  async poll (modelName, url) {
    const response = await (await fetch(url)).json();
    this.store.pushPayload(modelName, response);
    if (isArray(response.data)) {
      const result = response.data.map(entity => this.store.peekRecord(modelName, entity.id));
      return A(result);
    } else { // Object
      return this.store.peekRecord(modelName, response.data.id);
    }
  }

  register(pollingFunction, args) {
    const monitoredResource = {
      pollingFunction,
      args,
      resource: null
    };
    this.monitoredResources.pushObject(monitoredResource);
    this.lifecycle(monitoredResource);
    return monitoredResource;
  }

  unregister (resource) {
    const r = this.monitoredResources.findBy('resource', resource);
    if (r) {
      this.monitoredResources.removeObject(r);
    }
  }

  lifecycle (monitoredResource) {
    if (this.monitoredResources.includes(monitoredResource)) {
      this.pollResource.perform(monitoredResource);
      const timeout = this.monitoredResources.pollInterval || this.defaultPollInterval;
      later(this, this.lifecycle, monitoredResource, timeout);
    } else { // Resource got unregistered since last run
      return;
    }
  }

  @(task(function * (monitoredResource) {
    const resource = yield monitoredResource.pollingFunction.apply(this, monitoredResource.args);
    if (monitoredResource.resource === null) { // Inital poll
      monitoredResource.resource = resource;
    } else if (isArray(monitoredResource.resource)) {
      monitoredResource.resource.setObjects(resource);
    } // else: no-op, an update object's properties are already tracked through the data-store
    return monitoredResource.resource;
  }).maxConcurrency(1).enqueue()) pollResource;
}

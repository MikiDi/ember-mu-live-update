import Service from '@ember/service';
import { A } from '@ember/array'
import ArrayProxy from '@ember/array/proxy';
import ObjectProxy from '@ember/object/proxy';
import { later } from '@ember/runloop';
import { inject as service } from '@ember/service';
import fetch from 'fetch'
import { task } from 'ember-concurrency';
import { tracked } from '@glimmer/tracking';

export default class LiveUpdateService extends Service {
  @service store;

  @tracked monitoredResources = null;
  pollInterval = 4000;

  constructor () {
    super(...arguments);
    this.monitoredResources = A([]);
    this.lifecycle();
  }

  async findAll (type) {
    const monitoredResource = this.register(this.pollAll, [type], ArrayProxy);
    const resource = await this.pollResource.perform(monitoredResource);
    return resource;
  }

  async pollAll (modelName) {
    const url = this.store.adapterFor(modelName).urlForFindAll(...arguments);
    return this.poll(modelName, url);
  }

  async findRecord (type, id) {
    const monitoredResource = this.register(this.pollRecord, [id, type], ObjectProxy);
    const resource = await this.pollResource.perform(monitoredResource);
    return resource;
  }

  async pollRecord (id, modelName) {
    const url = this.store.adapterFor(modelName).urlForFindRecord(...arguments);
    return this.poll(modelName, url);
  }

  async query (type, query) {
    const monitoredResource = this.register(this.pollQuery, [query, type], ArrayProxy);
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
    if (Array.isArray(response.data)) {
      const result = response.data.map(entity => this.store.peekRecord(modelName, entity.id));
      return A(result);
    } else { // Object
      return this.store.peekRecord(modelName, response.data.id);
    }
  }

  register(pollingFunction, args, proxy) {
    return this.monitoredResources.pushObject({
      pollingFunction,
      args,
      resource: proxy.create()
    });
  }

  unregister (resource) {
    const r = this.monitoredResources.findBy('resource', resource);
    if (r) {
      this.monitoredResources.removeObject(r);
    }
  }

  lifecycle () {
    for (const resource of this.monitoredResources) {
      this.pollResource.perform(resource);
    }
    later(this, this.lifecycle, this.pollInterval);
  }

  @(task(function * (monitoredResource) {
    const resource = yield monitoredResource.pollingFunction.apply(this, monitoredResource.args);
    monitoredResource.resource.set('content', resource);
    return monitoredResource.resource;
  }).maxConcurrency(1).enqueue()) pollResource;
}

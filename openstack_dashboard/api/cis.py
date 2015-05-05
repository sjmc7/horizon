from django.conf import settings
from horizon import exceptions
import json
import logging
import requests
import six
import sys

from . import base


LOG = logging.getLogger(__name__)
thismodule = sys.modules[__name__]


def _get_cis_url(request):
    cis_url = getattr(settings, 'CIS_URL', None)
    try:
        cis_url = base.url_for(request, 'catalog-search')
    except exceptions.ServiceCatalogException:
        pass
    return cis_url


def cis_enabled(request):
    return _get_cis_url(request) is not None


def cis_wrapper(fn):
    """Assumes args[0] is a request object, otherwise
    this won't work. If fn.__name__ exists in this module
    AND CIS is enabled, use the CIS version. Finally, if
    'force-os-api' is set as a request parameter, don't use
    the wrapped function.
    """
    def wrapped(*args, **kwargs):
        request = args[0]
        force_native_api = request.GET.get('force-os-api', False)
        cis_url = _get_cis_url(request)
        cis_fn = getattr(thismodule, fn.__name__, None)
        if cis_url is None or cis_fn is None or force_native_api:
            return fn(*args, **kwargs)
        else:
            return cis_fn(*args, **kwargs)
    return wrapped


class ObjFromDict(object):
    """
    Generic object-from-a-dictionary wrapper. Since this is often passed
    back to the data layer and has other objects added to it, to_dict is
    more complicated than it has any right to be.
    """
    def __init__(self, **entries):
        self.__dict__.update(entries)

    def to_dict(self):
        def recursive_to_dict(d):
            if isinstance(d, dict):
                return dict((k, recursive_to_dict(v)) for k, v in six.iteritems(d))
            elif isinstance(d, (list, tuple, set)):
                return [recursive_to_dict(i) for i in d]
            elif hasattr(d, 'to_dict'):
                return d.to_dict()
            else:
                return d

        return recursive_to_dict(self.__dict__)

 
def server_list(request, search_opts=None, all_tenants=False):
    LOG.warning("CIS server-list")
    if search_opts is None:
        search_opts = {}

    cis_url = _get_cis_url(request) + '/search'

    def get_query_terms(query_field):
        search_terms = []

        if not all_tenants:
            search_terms.append({'term': {'tenant_id': request.user.tenant_id}})

        for field, term in query_field:
            if field == 'free':
                search_terms.append({'query_string': {'query': term}})
            else:
                if '~' in term:
                    next_term = {'query_string': {'fields': [field], 'query': term}}
                elif '*' in term or '?' in term:
                    next_term = {'wildcard': {field: term}}
                else:
                    next_term = {'term': {field: term}}

                if '.' in field:
                    # Nested!
                    search_terms.append({
                        "nested": {
                            "path": field.split('.')[0],
                            "query": next_term
                        }
                    })
                else:
                    search_terms.append(next_term)

        if search_terms:
            query = {
                'bool': {
                    'must': search_terms
                }
            }
        else:
            query = {'match_all': {}}

        return query

    query_fields = search_opts.get('query', [])
    search_query = get_query_terms(query_fields)

    request_body = {
        'query': search_query,
        'type': 'instance',
        'index': 'nova',
    }
    if 'sort' in search_opts:
        request_body['sort'] = search_opts['sort']
    if 'offset' in search_opts:
        request_body['offset'] = search_opts['offset']
    if 'limit' in search_opts:
        request_body['limit'] = search_opts['limit']
    if 'fields' in search_opts:
        request_body['fields'] = search_opts['fields'].split(',')

    retry_with_jiggle = search_opts.get('correct_typos', False)

    elastic_results = requests.post(
        cis_url,
        data=json.dumps(request_body),
        headers={'X-Auth-Token': request.user.token.id}
    ).json()
    LOG.warning("%s %s", request_body, elastic_results)

    # Logic to retry a search if there are no matches
    if retry_with_jiggle and elastic_results['hits']['total'] == 0:
        retry = False
        for k, v in query_fields:
            if k == 'free' and '~' not in v:
                query_fields.remove((k, v))
                query_fields.append((k, v + '~'))

                LOG.warning("Retrying search with jiggle factor")
                request_body['query'] = get_query_terms(query_fields)
                elastic_results = requests.post(
                    cis_url,
                    data=json.dumps(request_body),
                    headers={'X-Auth-Token': request.user.token.id}
                ).json()
                LOG.warning("%s %s", request_body, elastic_results)
                break

    class FakeInstance(ObjFromDict):
        @property
        def image_name(self):
            if isinstance(self.image, dict):
                return self.image['name']
            else:
                return self.image.name

    def fake_instance(**entries):
        instance = FakeInstance(**entries)
        instance.addresses = {}
        for net_ip in instance.networks:
            instance.addresses.setdefault(net_ip['name'], []).append(net_ip)
        setattr(instance, 'OS-EXT-SRV-ATTR:host', instance.host)
        return instance

    # Returns list, has_more
    return [fake_instance(**h['_source']) for h in elastic_results['hits']['hits']], False


def server_search_facets(request):
    cis_url = _get_cis_url(request) + '/search/facets?index=nova&type=instance'
    return requests.get(
        cis_url,
        headers={'X-Auth-Token': request.user.token.id}
    ).json()['nova']['instance']


def image_list_detailed(request, marker=None, sort_dir='desc',
                        sort_key='created_at', filters=None, paginate=False):
    cis_url = _get_cis_url(request) + '/search'
    request_body = {
        'query': {'match_all': {}},
        'type': 'image',
        'index': 'glance',
    }

    elastic_results = requests.post(
        cis_url,
        data=json.dumps(request_body),
        headers={'X-Auth-Token': request.user.token.id}
    ).json()

    class FakeImage(ObjFromDict):
        @property
        def is_public(self):
            return self.visibility == 'public'

        @property
        def properties(self):
            # Don't know if we have this
            return {}
            
    return [FakeImage(**hit['_source']) for hit in elastic_results['hits']['hits']], False, False

from django.conf import settings
from horizon import exceptions
import json
import logging
import requests
import sys

from . import base


LOG = logging.getLogger(__name__)
thismodule = sys.modules[__name__]


def _get_cis_url(request):
    cis_url = getattr(settings, 'CIS_URL', None)
    try:
        cis_url = base.url_for(request, 'catalog-index')
    except exceptions.ServiceCatalogException:
        pass
    return cis_url


def cis_wrapper(fn):
    """Assumes args[0] is a request object, otherwise
    this won't work. If fn.__name__ exists in this module
    AND CIS is enabled, use the CIS version
    """
    def wrapped(*args, **kwargs):
        request = args[0]
        cis_url = _get_cis_url(request)
        cis_fn = getattr(thismodule, fn.__name__, None)
        if cis_url is None or cis_fn is None:
            return fn(*args, **kwargs)
        else:
            return cis_fn(*args, **kwargs)
    return wrapped


def server_list(request, search_opts=None, all_tenants=False):
    LOG.warning("CIS server-list")
    cis_url = _get_cis_url(request) + '/search'
    elastic_results = requests.post(
        cis_url,
        data=json.dumps({'query': {'match_all': {}}, "type": "instance"}),
        headers={'X-Auth-Token': request.user.token.id}
    ).json()
    LOG.warning("%s", elastic_results)

    class ObjFromDict(object):
        def __init__(self, **entries):
            self.__dict__.update(entries)

        def to_dict(self):
            return self.__dict__

    class FakeInstance(ObjFromDict):
        @property
        def image_name(self):
            return self.image.name

    def fake_instance(**entries):
        instance = FakeInstance(**entries)
        instance.flavor = {'id': instance.flavor_id}
        instance.image = {'id': instance.image_id}
        instance.addresses = {}
        for net_name, ips in instance.networks.iteritems():
            instance.addresses[net_name] = [{'addr': ip} for ip in ips]
        return instance

    # Returns list, has_more
    return [fake_instance(**h['_source']) for h in elastic_results['hits']['hits']], False


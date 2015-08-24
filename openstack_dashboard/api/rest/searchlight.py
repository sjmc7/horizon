# Copyright 2015, Hewlett-Packard Development Company, L.P.
#
# Licensed under the Apache License, Version 2.0 (the "License");
# you may not use this file except in compliance with the License.
# You may obtain a copy of the License at
#
#    http://www.apache.org/licenses/LICENSE-2.0
#
# Unless required by applicable law or agreed to in writing, software
# distributed under the License is distributed on an "AS IS" BASIS,
# WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
# See the License for the specific language governing permissions and
# limitations under the License.

from django.conf import settings
from django.views import generic
from django.views.decorators.csrf import csrf_exempt
import functools
import json
import requests

from horizon import exceptions
from openstack_dashboard.api import base
from openstack_dashboard.api.rest import urls
from openstack_dashboard.api.rest import utils as rest_utils


@urls.register
class Search(generic.View):
    """Pass-through API for executing searches against searchlight.
    """
    url_regex = r'searchlight/search/$'

    @csrf_exempt
    @rest_utils.ajax()
    def post(self, request):
        """Executes a search query against searchlight and returns the 'hits'
        from the response. Currently accepted parameters are:
           * query (see Elasticsearch DSL)
           * index (scalar or list)
           * type (scalar or list - note that index and type may be
             replaced by a 'resource' parameter
           * offset (for paging)
           * limit (paging)
           * fields (restricts returned object fields)
           * highlight (adds Elasticsearch highlight clause)
           * sort (see Elasticsearch DSL)

        Searches default to
        """
        # TODO(sjmc7): validate what's passed in? Or just send it on?
        search_parameters = dict(request.DATA) if request.DATA else {}

        # Set some defaults
        search_parameters.setdefault('limit', 20)
        search_parameters.setdefault('query', {'match_all': {}})

        # Example:
        # {"hits": ["_id": abc, "_source": {..}], "max_score": 2.0, "total": 3}
        return searchlight_post(
            '/search',
            request,
            search_parameters
        ).json()['hits']


@urls.register
class EnabledResources(generic.View):
    """API call to interrogate searchlight for enabled resource types.
    """
    url_regex = r'searchlight/enabled-resources/$'

    @rest_utils.ajax()
    def get(self, request):
        """Requests enabled searchlight plugins.
        At this time the response looks like:
           {"plugins": [{"index": "glance", "type": "image}.. ]
        """
        return searchlight_get('/search/plugins', request).json()


def _searchlight_request(request_method, url, request, data=None):
    """Makes a request to searchlight with an optional payload. Should set
    any necessary auth headers and SSL parameters.
    """
    # Set verify if a CACERT is set and SSL_NO_VERIFY isn't True
    verify = getattr(settings, 'OPENSTACK_SSL_CACERT', None)
    if getattr(settings, 'OPENSTACK_SSL_NO_VERIFY', False):
        verify = False

    return request_method(
        _get_searchlight_url(request) + url,
        headers={'X-Auth-Token': request.user.token.id},
        data=json.dumps(data) if data else None,
        verify=verify
    )


# Create some convenience partial functions
searchlight_get = functools.partial(_searchlight_request, requests.get)
searchlight_post = functools.partial(_searchlight_request, requests.post)


def _get_searchlight_url(request):
    """Get searchlight's URL from keystone; allow an override in settings"""
    searchlight_url = getattr(settings, 'SEARCHLIGHT_URL', None)
    try:
        searchlight_url = base.url_for(request, 'search')
    except exceptions.ServiceCatalogException:
        pass
    # Currently the keystone endpoint is http://host:port/
    # without the version.
    return searchlight_url + 'v1'

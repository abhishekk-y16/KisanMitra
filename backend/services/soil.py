from typing import Dict, Any, List, Optional
from PIL import Image, ImageStat
import io
import httpx
import math


def _avg_color_from_bytes(b: bytes) -> Optional[tuple]:
    try:
        im = Image.open(io.BytesIO(b)).convert('RGB')
        stat = ImageStat.Stat(im)
        return tuple(int(x) for x in stat.mean)
    except Exception:
        return None


def _texture_estimate_from_bytes(b: bytes) -> str:
    try:
        im = Image.open(io.BytesIO(b)).convert('L').resize((100, 100))
        stat = ImageStat.Stat(im)
        contrast = stat.stddev[0]
        # heuristic thresholds
        if contrast < 10:
            return 'compact/low-structure'
        if contrast < 30:
            return 'fine/loamy'
        return 'coarse/gritty (sandy or aggregated)'
    except Exception:
        return 'unknown'


def analyze_images(images: List[bytes]) -> Dict[str, Any]:
    """Return an aggregate visual analysis from provided image bytes."""
    colors = []
    textures = {}
    for b in images:
        c = _avg_color_from_bytes(b)
        if c:
            colors.append(c)
        t = _texture_estimate_from_bytes(b)
        textures[t] = textures.get(t, 0) + 1

    # summarize color
    color_desc = 'unknown'
    if colors:
        avg = tuple(sum(x[i] for x in colors) // len(colors) for i in range(3))
        r, g, bl = avg
        # simple mapping
        if r > 190 and g > 190 and bl > 190:
            color_desc = 'pale/bleached'
        elif r > g and r > bl and r > 120:
            color_desc = 'reddish (iron-rich or oxidised)'
        elif g > r and g > bl:
            color_desc = 'dark brown/black (organic-rich)'
        elif bl > r and bl > g:
            color_desc = 'greyish'
        else:
            color_desc = 'brownish (typical topsoil)'

    # dominant texture
    dominant_texture = max(textures.items(), key=lambda kv: kv[1])[0] if textures else 'unknown'

    # heuristic nutrient inferences (indicative only)
    likely = {
        'pH_range': 'neutral to slightly acidic',
        'organic_carbon': 'medium',
        'N': 'moderate',
        'P': 'moderate',
        'K': 'moderate',
    }
    # adjust heuristics
    if color_desc in ('dark brown/black (organic-rich)',):
        likely['organic_carbon'] = 'high'
        likely['N'] = 'likely adequate'
    if color_desc in ('pale/bleached',):
        likely['organic_carbon'] = 'low'
        likely['N'] = 'likely low'
    if 'sandy' in dominant_texture or 'gritty' in dominant_texture:
        likely['P'] = 'tends to be low (leaching)'
        likely['K'] = 'can be low'

    issues = []
    if color_desc == 'greyish':
        issues.append('Possible waterlogging or poor drainage (grey colours often indicate reduced iron).')
    if 'compact' in dominant_texture:
        issues.append('Surface compaction detected; poor infiltration likely.')
    if color_desc == 'pale/bleached':
        issues.append('Low organic matter — soil looks bleached.')

    return {
        'color_description': color_desc,
        'dominant_texture': dominant_texture,
        'likely': likely,
        'issues': issues,
        'confidence': 'indicative',
    }


def generate_farmer_report(analysis: Dict[str, Any], location: Optional[Dict[str, float]] = None, notes: Optional[str] = None) -> Dict[str, Any]:
    # Compose a farmer-friendly, structured report using the analysis
    summary = f"Soil appears {analysis.get('color_description')} with {analysis.get('dominant_texture')} texture." \
        if analysis else "Soil visual analysis unavailable."
    problems = analysis.get('issues', []) if analysis else []

    # Natural, low-cost solutions (no chemicals first)
    natural_steps = [
        'Add well-decomposed compost or farmyard manure (FYM) to build organic matter and improve structure.',
        'Grow green manures (e.g., Sesbania, Dhaincha) during fallow to fix nitrogen and add biomass.',
        'Mulch with straw or crop residues to conserve moisture and feed soil life.',
        'Use vermicompost where possible for gentle nutrient release and microbial improvement.',
        'Introduce crop rotation with legumes (pulses) to improve N status naturally.'
    ]

    # Practical why/explanations
    natural_expl = {
        'compost': 'Adds organic carbon, improves moisture retention and soil life.',
        'green_manure': 'Fixes nitrogen (if legume) and adds biomass to increase organic matter.',
        'mulch': 'Reduces evaporation, moderates soil temperature, and reduces erosion.',
        'vermicompost': 'Fast-acting, provides nutrients and beneficial microbes.'
    }

    # Crop suitability heuristics
    if 'sandy' in analysis.get('dominant_texture', ''):
        best = ['Millets (bajra), Groundnut, Pearl millet, Pigeon pea']
        avoid = ['Waterlogging-sensitive vegetables until organic matter improved']
    elif 'compact' in analysis.get('dominant_texture', ''):
        best = ['Deep-rooted legumes, pulses']
        avoid = ['Shallow-rooted vegetables until soil is loosened']
    else:
        best = ['Wheat, pulses, vegetables (with organic inputs)']
        avoid = ['None specific']

    # Likely nutrient status (already prepared in analysis['likely'])
    likely = analysis.get('likely', {}) if analysis else {}

    # Precautions and good practices
    precautions = [
        'Do not apply high doses of synthetic NPK without a soil test; it can worsen imbalances.',
        'Avoid puddling and waterlogging; ensure fields have drainage channels if needed.',
        'Do not burn crop residues; use them as mulch or compost.'
    ]

    # Nearby centers lookup using reverse geocoding to extract state/district and map to example centers
    nearby = []
    if location and isinstance(location, dict):
        lat = location.get('lat')
        lng = location.get('lng')
        if lat is not None and lng is not None:
            state = _reverse_geocode_state(lat, lng)
            nearby = _lookup_centers_by_state(state, lat, lng)

    report = {
        'summary': summary,
        'what_images_show': analysis,
        'problems_identified': problems,
        'likely_nutrient_status': likely,
        'natural_improvements': natural_steps,
        'natural_explanations': natural_expl,
        'crop_recommendations': {'best': best, 'avoid': avoid},
        'precautions': precautions,
        'nearby_centers': nearby,
        'notes': notes or '',
        'confidence_note': 'Image-based diagnosis is indicative; confirm with an official soil lab test.'
    }

    # If no centers found but we have a location, add a helpful maps-search fallback
    if (not nearby) and location and isinstance(location, dict):
        lat = location.get('lat')
        lng = location.get('lng')
        if lat is not None and lng is not None:
            maps_query = f"https://www.google.com/maps/search/?api=1&query=Krishi+Vigyan+Kendra+near+{lat}%2C{lng}"
            report['nearby_centers'] = [{'name': 'Search KVK / Soil Lab near your farm', 'distance_km': None, 'service': 'Open maps search', 'maps_search': maps_query}]

    return report


def _reverse_geocode_state(lat: float, lng: float) -> Optional[str]:
    """Use Nominatim reverse geocoding to get state/district from lat/lng. Returns state name or None."""
    try:
        url = 'https://nominatim.openstreetmap.org/reverse'
        params = {'format': 'json', 'lat': lat, 'lon': lng, 'zoom': 10, 'addressdetails': 1}
        with httpx.Client(timeout=10.0, headers={'User-Agent': 'KisanBuddy/1.0'}) as client:
            r = client.get(url, params=params)
            r.raise_for_status()
            j = r.json()
            addr = j.get('address', {})
            # Try common keys
            return addr.get('state') or addr.get('region') or addr.get('county')
    except Exception:
        return None


def _lookup_centers_by_state(state: Optional[str], lat: float, lng: float) -> List[Dict[str, Any]]:
    """Return a small list of example nearby government centers for a given Indian state.
    This is a lightweight mapping; for production integrate an authoritative directory.
    """
    if not state:
        return []

    # Minimal example mapping. Expand with real data as needed.
    centers_by_state = {
        'Karnataka': [
            {'name': 'Krishi Vigyan Kendra - University of Agricultural Sciences, Dharwad', 'lat': 15.4589, 'lng': 75.0078, 'service': 'Soil testing, advisory'},
            {'name': 'District Soil Testing Lab, Bengaluru', 'lat': 12.9716, 'lng': 77.5946, 'service': 'Soil testing'}
        ],
        'Maharashtra': [
            {'name': 'KVK - Pune', 'lat': 18.5204, 'lng': 73.8567, 'service': 'Soil testing, demonstrations'},
        ],
        'Default': [
            {'name': 'Nearest Agriculture Extension Office', 'lat': lat, 'lng': lng, 'service': 'Advisory, refer to local soil lab'}
        ]
    }

    lst = centers_by_state.get(state) or centers_by_state.get('Default')

    # compute approximate distance
    def _dist(a_lat, a_lng, b_lat, b_lng):
        # haversine
        R = 6371.0
        dlat = math.radians(b_lat - a_lat)
        dlng = math.radians(b_lng - a_lng)
        alat = math.radians(a_lat)
        blat = math.radians(b_lat)
        h = math.sin(dlat/2)**2 + math.cos(alat)*math.cos(blat)*math.sin(dlng/2)**2
        return R * (2 * math.atan2(math.sqrt(h), math.sqrt(1-h)))

    out = []
    for c in lst:
        dist_km = round(_dist(lat, lng, c.get('lat', lat), c.get('lng', lng)), 2)
        out.append({'name': c['name'], 'distance_km': dist_km, 'service': c.get('service', '')})

    return out


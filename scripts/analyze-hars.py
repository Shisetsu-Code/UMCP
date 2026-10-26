#!/usr/bin/env python3
"""Read HAR files sequentially and write a body-free, sanitized JSON inventory.

Python 3.9+; standard library only. No network, browser or git operations.
Usage: python3 scripts/analyze-hars.py --input /path/to/hars --output summary.json
"""
import argparse
import base64
import collections
import gc
import hashlib
import json
import os
import re
import sys
import tempfile
import xml.etree.ElementTree as ET
from pathlib import Path
from urllib.parse import parse_qsl, urlsplit

MAX_SCHEMA_CHARS = 1_000_000


def clean_url(value):
    """Drop all query values, fragments and userinfo; template dynamic paths."""
    try:
        u = urlsplit(value)
        if u.scheme not in ('http', 'https', 'ws', 'wss'):
            return u.scheme + ':<omitted>'
        host = u.hostname or ''
        if ':' in host:
            host = '[' + host + ']'
        if u.port:
            host += ':' + str(u.port)
        path = re.sub(r'(/socket\.io/\d+/websocket/)[^/]+', r'\1{connectionId}', u.path)
        path = re.sub(r'(/actions-v2/)\d+(?=/|$)', r'\1{actionId}', path)
        path = re.sub(r'(/sessions?/)[^/]+', r'\1{sessionId}', path, flags=re.I)
        parts = []
        for part in path.split('/'):
            if re.fullmatch(r'[a-fA-F0-9]{24,}|[a-fA-F0-9]{8}(?:-[a-fA-F0-9]{4}){3}-[a-fA-F0-9]{12}', part):
                part = '{opaque}'
            elif len(part) > 30 and re.search(r'\d', part) and re.search(r'[A-Za-z]', part) and not re.search(r'\.(?:js|css|json|png|jpg|webp|woff2?|mp3|ogg|svg|html|xml|atlas)$', part):
                part = '{opaque}'
            if len(part) > 160:
                part = '{long-segment}'
            parts.append(part)
        return u.scheme + '://' + host + '/'.join(parts)
    except (ValueError, TypeError):
        return '<invalid-url>'


def key_name(value):
    value = str(value)
    if re.fullmatch(r'[a-fA-F0-9]{16,}', value):
        return '<dynamic-key>'
    return value if re.fullmatch(r'[A-Za-z_$][\w.$:-]{0,63}|[0-9]{1,3}', value) else '<dynamic-key>'


def scalar_type(value):
    if value is None:
        return 'null'
    if isinstance(value, bool):
        return 'boolean'
    if isinstance(value, (int, float)):
        return 'number'
    if isinstance(value, dict):
        return 'object'
    if isinstance(value, list):
        return 'array'
    return 'string'


def merge(target, source):
    for key, types in source.items():
        target.setdefault(key, set()).update(types)


def xml_schema(text, prefix=''):
    fields = {}
    # Do not resolve declared entities or inspect documents that declare a DTD.
    if re.search(r'<!DOCTYPE|<!ENTITY', text, re.I):
        return fields
    try:
        root = ET.fromstring(text)
    except ET.ParseError:
        return fields

    def walk(node, path, depth=0):
        if depth > 12:
            return
        path += '/' + key_name(node.tag.split('}')[-1])
        fields.setdefault(path, set()).add('xml-element')
        for key in node.attrib:
            fields.setdefault(path + '/@' + key_name(key), set()).add('xml-string')
        if node.text and node.text.strip():
            fields.setdefault(path + '/#text', set()).add('xml-string')
        for child in node:
            walk(child, path, depth + 1)

    walk(root, prefix)
    return fields


def json_schema(value, path='$', depth=0, fields=None):
    fields = {} if fields is None else fields
    if depth > 7:
        return fields
    fields.setdefault(path, set()).add(scalar_type(value))
    if isinstance(value, dict):
        for key, item in list(value.items())[:150]:
            child = path + '.' + key_name(key)
            json_schema(item, child, depth + 1, fields)
            if key == 'payload' and isinstance(item, str) and item.lstrip().startswith('<') and len(item) <= MAX_SCHEMA_CHARS:
                merge(fields, xml_schema(item, child + '::xml'))
    elif isinstance(value, list):
        for item in value[:8]:
            json_schema(item, path + '[]', depth + 1, fields)
    return fields


def body_structure(container):
    text = container.get('text', '')
    if not isinstance(text, str) or not text:
        return 'empty', {}
    if len(text) > MAX_SCHEMA_CHARS:
        return 'schema-scan-limit', {}
    if container.get('encoding') == 'base64':
        try:
            text = base64.b64decode(text, validate=True).decode('utf-8')
        except (ValueError, UnicodeDecodeError):
            return 'base64-binary', {}
    stripped = text.lstrip()
    if stripped.startswith(('{', '[')):
        try:
            return 'json', json_schema(json.loads(text))
        except ValueError:
            return 'invalid-json-like', {}
    if stripped.startswith('<'):
        fields = xml_schema(text)
        return ('xml' if fields else 'html-or-invalid-xml'), fields
    if 'x-www-form-urlencoded' in container.get('mimeType', '') and re.match(r'[A-Za-z_$][A-Za-z0-9_.$-]{0,70}=', text):
        return 'form-urlencoded', json_schema(dict(parse_qsl(text, keep_blank_values=True)))
    return 'opaque-text', {}


def is_websocket(entry):
    req, resp = entry.get('request', {}), entry.get('response', {})
    headers = {h.get('name', '').lower(): h.get('value', '').lower() for h in req.get('headers', []) + resp.get('headers', [])}
    return req.get('url', '').startswith(('ws:', 'wss:')) or entry.get('_resourceType') == 'websocket' or '_webSocketMessages' in entry or (resp.get('status') == 101 and headers.get('upgrade') == 'websocket')


def inspect_file(path, label, digest):
    with path.open(encoding='utf-8-sig') as handle:
        document = json.load(handle)
    entries = document.get('log', {}).get('entries')
    if not isinstance(entries, list):
        raise ValueError('Expected HAR log.entries array: ' + label)
    result = {'file': label, 'sha256': digest, 'size_bytes': path.stat().st_size,
              'entry_count': len(entries), 'http_entries': 0, 'ws_handshakes': 0,
              'ws_frames': 0, 'other_entries': 0, 'methods': collections.Counter(),
              'statuses': collections.Counter(), 'endpoints': []}
    endpoints = {}
    for entry in entries:
        req, resp = entry.get('request', {}), entry.get('response', {})
        raw_url = req.get('url', '')
        ws = is_websocket(entry)
        if ws:
            result['ws_handshakes'] += 1
        elif raw_url.startswith(('http:', 'https:')):
            result['http_entries'] += 1
        else:
            result['other_entries'] += 1
            continue
        frames = entry.get('_webSocketMessages', entry.get('_webSocketFrames', []))
        result['ws_frames'] += len(frames) if isinstance(frames, list) else 0
        method = req.get('method', '?')
        result['methods'][method] += 1
        result['statuses'][str(resp.get('status', 0))] += 1
        url = clean_url(raw_url)
        ep = endpoints.setdefault((method, url), {'method': method, 'url': url, 'count': 0,
              'statuses': collections.Counter(), 'request_encodings': collections.Counter(),
              'response_encodings': collections.Counter(), 'request_schema': {}, 'response_schema': {}})
        ep['count'] += 1
        ep['statuses'][str(resp.get('status', 0))] += 1
        for side, body in [('request', req.get('postData', {})), ('response', resp.get('content', {}))]:
            encoding, fields = body_structure(body)
            ep[side + '_encodings'][encoding] += 1
            merge(ep[side + '_schema'], fields)
    result['endpoints'] = list(endpoints.values())
    return result


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--input', required=True, type=Path, help='Read-only directory of .har files (searched recursively)')
    parser.add_argument('--output', required=True, type=Path, help='Destination JSON inventory, never an input .har file')
    args = parser.parse_args()
    source, output = args.input.resolve(), args.output.resolve()
    if not source.is_dir():
        parser.error('--input must be an existing directory')
    paths = sorted(p for p in source.rglob('*') if p.is_file() and p.suffix.lower() == '.har')
    if not paths:
        parser.error('No .har files found')
    if output.suffix.lower() == '.har' or any(output == p.resolve() for p in paths):
        parser.error('--output must not replace or create an input HAR')
    seen, files = {}, []
    for path in paths:
        digest = hashlib.sha256()
        with path.open('rb') as handle:
            for chunk in iter(lambda: handle.read(4 * 1024 * 1024), b''):
                digest.update(chunk)
        sha = digest.hexdigest()
        label = path.relative_to(source).as_posix()
        if sha in seen:
            first = seen[sha]
            info = {k: v for k, v in first.items() if k != 'endpoints'}
            info.update(file=label, duplicate_of=first['file'])
        else:
            info = inspect_file(path, label, sha)
            seen[sha] = info
        files.append(info)
        gc.collect()
    unique = [f for f in files if 'duplicate_of' not in f]
    report = {'schema_version': 1, 'scope': 'Offline structural metadata only; no header values, cookies, query values or body values are emitted.',
              'limits': {'max_schema_chars': MAX_SCHEMA_CHARS, 'json_depth': 7, 'xml_depth': 12, 'json_array_samples': 8},
              'limitations': ['Missing WS frames in HAR does not establish absence of WS activity.', 'Schemas are observed unions, not exhaustive contracts.', 'Opaque payloads are preserved only as format labels.', 'Different files may contain overlapping captured events.'],
              'totals': {'files': len(files), 'unique_sha256_files': len(unique),
                         'entries_all_files': sum(f['entry_count'] for f in files),
                         'entries_unique_files': sum(f['entry_count'] for f in unique),
                         'http_entries_unique_files': sum(f['http_entries'] for f in unique),
                         'ws_handshakes_unique_files': sum(f['ws_handshakes'] for f in unique),
                         'ws_frames_unique_files': sum(f['ws_frames'] for f in unique)}, 'files': files}
    output.parent.mkdir(parents=True, exist_ok=True)
    handle, temporary = tempfile.mkstemp(prefix='.har-summary-', suffix='.json', dir=output.parent)
    try:
        with os.fdopen(handle, 'w', encoding='utf-8') as target:
            json.dump(report, target, indent=2, ensure_ascii=False, default=lambda value: sorted(value) if isinstance(value, set) else value)
            target.write('\n')
        os.replace(temporary, output)
    finally:
        if os.path.exists(temporary):
            os.unlink(temporary)
    print(json.dumps({'files': len(files), 'unique_sha256_files': len(unique), 'output': str(output)}))


if __name__ == '__main__':
    try:
        main()
    except (OSError, ValueError, TypeError) as exc:
        print('HAR analysis failed: ' + str(exc), file=sys.stderr)
        sys.exit(1)

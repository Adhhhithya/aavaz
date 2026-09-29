import json
from fastapi.testclient import TestClient
from main import app
from urllib.parse import urlencode

client = TestClient(app)

def generate_valid_value(schema_type):
    if schema_type == "integer": return 1
    if schema_type == "number": return 1.0
    if schema_type == "string": return "test_string"
    if schema_type == "boolean": return True
    if schema_type == "array": return []
    if schema_type == "object": return {}
    return "test"

def generate_invalid_value(schema_type):
    if schema_type == "integer": return "not_an_int"
    if schema_type == "number": return "not_a_number"
    if schema_type == "string": return 12345 # fastAPI might coerce this to string, but maybe not if strict
    if schema_type == "boolean": return "not_a_bool"
    if schema_type == "array": return "not_an_array"
    if schema_type == "object": return "not_an_object"
    return None

def build_payload(schema, definitions, valid=True):
    if not schema: return {}
    if "$ref" in schema:
        ref_name = schema["$ref"].split("/")[-1]
        schema = definitions[ref_name]
    
    if schema.get("type") == "object" and "properties" in schema:
        payload = {}
        for prop, prop_schema in schema["properties"].items():
            if valid:
                payload[prop] = generate_valid_value(prop_schema.get("type", "string"))
            else:
                # To make it invalid, we drop required fields or send wrong types
                if prop in schema.get("required", []):
                    # Omit required field sometimes or send invalid type
                    payload[prop] = generate_invalid_value(prop_schema.get("type", "string"))
        return payload
    return {}

def test_endpoints():
    print("Fetching OpenAPI schema...")
    response = client.get("/openapi.json")
    if response.status_code != 200:
        print("Failed to get openapi.json")
        return
    
    openapi = response.json()
    paths = openapi.get("paths", {})
    components = openapi.get("components", {}).get("schemas", {})
    
    crashes = []

    print(f"Found {len(paths)} paths.")
    for path, methods in paths.items():
        for method, operation in methods.items():
            print(f"Testing {method.upper()} {path}...")
            
            # Prepare Path parameters
            path_params = {}
            query_params = {}
            for param in operation.get("parameters", []):
                param_in = param.get("in")
                param_name = param.get("name")
                schema_type = param.get("schema", {}).get("type", "string")
                if param_in == "path":
                    path_params[param_name] = generate_valid_value(schema_type)
                elif param_in == "query":
                    query_params[param_name] = generate_valid_value(schema_type)
            
            # Format path
            actual_path = path
            for k, v in path_params.items():
                actual_path = actual_path.replace(f"{{{k}}}", str(v))
            
            # Prepare Body
            body_schema = None
            if "requestBody" in operation:
                content = operation["requestBody"].get("content", {})
                if "application/json" in content:
                    body_schema = content["application/json"].get("schema")

            # 1. Test Valid payload
            valid_body = build_payload(body_schema, components, valid=True) if body_schema else None
            try:
                if method == "get":
                    res = client.get(actual_path, params=query_params)
                elif method == "post":
                    res = client.post(actual_path, params=query_params, json=valid_body)
                elif method == "put":
                    res = client.put(actual_path, params=query_params, json=valid_body)
                elif method == "delete":
                    res = client.delete(actual_path, params=query_params)
                else:
                    res = client.request(method.upper(), actual_path, params=query_params)
                
                if res.status_code >= 500:
                    print(f"CRASH (Valid Request): {method.upper()} {actual_path} -> {res.status_code}")
                    crashes.append((method.upper(), actual_path, "VALID", res.status_code, res.text))
            except Exception as e:
                print(f"EXCEPTION (Valid Request): {method.upper()} {actual_path} -> {e}")
                crashes.append((method.upper(), actual_path, "VALID", "EXCEPTION", str(e)))

            # 2. Test Invalid payload (if there's a body or params)
            invalid_body = build_payload(body_schema, components, valid=False) if body_schema else None
            try:
                if method == "get":
                    res = client.get(actual_path, params={"bad": "query"})
                elif method == "post":
                    res = client.post(actual_path, params={"bad": "query"}, json=invalid_body)
                elif method == "put":
                    res = client.put(actual_path, params={"bad": "query"}, json=invalid_body)
                elif method == "delete":
                    res = client.delete(actual_path, params={"bad": "query"})
                else:
                    res = client.request(method.upper(), actual_path, params={"bad": "query"})

                if res.status_code >= 500:
                    print(f"CRASH (Invalid Request): {method.upper()} {actual_path} -> {res.status_code}")
                    crashes.append((method.upper(), actual_path, "INVALID", res.status_code, res.text))
            except Exception as e:
                print(f"EXCEPTION (Invalid Request): {method.upper()} {actual_path} -> {e}")
                crashes.append((method.upper(), actual_path, "INVALID", "EXCEPTION", str(e)))

            # 3. Test Empty payload
            if body_schema:
                try:
                    if method == "post":
                        res = client.post(actual_path, params=query_params, json={})
                    elif method == "put":
                        res = client.put(actual_path, params=query_params, json={})
                        
                    if res.status_code >= 500:
                        print(f"CRASH (Empty Request): {method.upper()} {actual_path} -> {res.status_code}")
                        crashes.append((method.upper(), actual_path, "EMPTY", res.status_code, res.text))
                except Exception as e:
                    print(f"EXCEPTION (Empty Request): {method.upper()} {actual_path} -> {e}")
                    crashes.append((method.upper(), actual_path, "EMPTY", "EXCEPTION", str(e)))

    print("\n--- TEST SUMMARY ---")
    if not crashes:
        print("SUCCESS! No 500 crashes detected.")
    else:
        print(f"Found {len(crashes)} crashing endpoints:")
        for crash in crashes:
            print(f"{crash[0]} {crash[1]} ({crash[2]} payload) => {crash[3]}")
            print(f"Response: {crash[4]}")

if __name__ == "__main__":
    test_endpoints()

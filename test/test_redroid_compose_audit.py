import unittest

from scripts.redroid_compose_audit import audit_compose


def valid_config():
    return {
        "services": {
            "redroid": {"privileged": True, "networks": ["android-private"], "ports": [{"host_ip": "127.0.0.1", "published": "5555", "target": 5555}]},
            "gateway": {"environment": {"GATEWAY_TOKEN": "x" * 40}, "networks": ["android-private"], "ports": [{"host_ip": "127.0.0.1", "published": "8080", "target": 8080}]},
            "stream": {
                "profiles": ["streaming"],
                "networks": ["android-private"],
                "environment": {"WS_SCRCPY_ALLOW_REMOTE_ADMIN": "0"},
                "ports": [{"host_ip": "127.0.0.1", "published": "8000", "target": 8000}],
            },
        }
    }


class RedroidComposeAuditTests(unittest.TestCase):
    def test_accepts_loopback_only_stack_and_safe_stream_defaults(self):
        self.assertEqual(audit_compose(valid_config()), [])

    def test_rejects_public_adb_gateway_or_stream_ports(self):
        config = valid_config()
        config["services"]["redroid"]["ports"][0]["host_ip"] = "0.0.0.0"
        config["services"]["gateway"]["ports"][0]["host_ip"] = "::"
        config["services"]["stream"]["ports"][0]["host_ip"] = "192.0.2.10"
        errors = audit_compose(config)
        self.assertEqual(len(errors), 3)
        self.assertTrue(all("loopback" in error for error in errors))

    def test_rejects_remote_admin_and_missing_stream_profile(self):
        config = valid_config()
        config["services"]["stream"]["environment"]["WS_SCRCPY_ALLOW_REMOTE_ADMIN"] = "1"
        config["services"]["stream"]["profiles"] = []
        errors = audit_compose(config)
        self.assertTrue(any("streaming" in error for error in errors))
        self.assertTrue(any("REMOTE_ADMIN" in error for error in errors))

    def test_rejects_missing_required_services(self):
        config = valid_config()
        del config["services"]["gateway"]
        self.assertTrue(any("gateway" in error for error in audit_compose(config)))

    def test_rejects_services_outside_private_network_and_privileged_gateway(self):
        config = valid_config()
        config["services"]["stream"]["networks"] = ["default"]
        config["services"]["gateway"]["privileged"] = True
        errors = audit_compose(config)
        self.assertTrue(any("android-private" in error and "stream" in error for error in errors))
        self.assertTrue(any("gateway" in error and "privileged" in error for error in errors))

    def test_rejects_missing_gateway_token(self):
        config = valid_config()
        config["services"]["gateway"]["environment"]["GATEWAY_TOKEN"] = ""
        self.assertTrue(any("GATEWAY_TOKEN" in error for error in audit_compose(config)))


if __name__ == "__main__":
    unittest.main()

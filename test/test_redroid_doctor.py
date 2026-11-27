import subprocess
import unittest
from unittest.mock import Mock

from scripts.redroid_doctor import (
    inspect_android,
    inspect_host,
    parse_adb_devices,
    parse_properties,
)


class RedroidDoctorTests(unittest.TestCase):
    def test_adb_device_state_parser_matches_exact_serial(self):
        output = (
            "List of devices attached\n"
            "redroid:5555 device\n"
            "127.0.0.1:55550 unauthorized\n"
        )
        self.assertEqual(parse_adb_devices(output, "redroid:5555"), "device")
        self.assertEqual(parse_adb_devices(output, "127.0.0.1:5555"), "missing")

    def test_android_properties_are_normalized(self):
        result = parse_properties(" 14\r\n", " redroid_x86_64 ", "1\r\n")
        self.assertEqual(result, {
            "android_release": "14",
            "device_model": "redroid_x86_64",
            "boot_completed": True,
        })

    def test_host_check_reports_missing_binder_as_warning_not_fake_success(self):
        def fake_exists(path):
            return path == "/dev/dri"

        checks = inspect_host(
            runner=Mock(),
            system="Linux",
            architecture="x86_64",
            exists=fake_exists,
            which=lambda name: None,
        )
        by_name = {item.name: item for item in checks}
        self.assertEqual(by_name["linux_host"].status, "PASS")
        self.assertEqual(by_name["architecture"].status, "PASS")
        self.assertEqual(by_name["docker_cli"].status, "FAIL")
        self.assertEqual(by_name["binder"].status, "WARN")
        self.assertIn("binder", by_name["binder"].detail.lower())

    def test_unsupported_host_is_reported_as_failure(self):
        checks = inspect_host(
            runner=Mock(),
            system="Windows",
            architecture="i686",
            exists=lambda _path: False,
            which=lambda _name: None,
        )
        by_name = {item.name: item for item in checks}
        self.assertEqual(by_name["linux_host"].status, "FAIL")
        self.assertEqual(by_name["architecture"].status, "FAIL")

    def test_android_boot_state_uses_adb_properties(self):
        responses = [
            subprocess.CompletedProcess([], 0, "connected to 127.0.0.1:5555", ""),
            subprocess.CompletedProcess([], 0, "List of devices attached\n127.0.0.1:5555 device\n", ""),
            subprocess.CompletedProcess([], 0, "1\n", ""),
            subprocess.CompletedProcess([], 0, "14\n", ""),
            subprocess.CompletedProcess([], 0, "redroid_x86_64\n", ""),
        ]
        runner = Mock(side_effect=responses)
        with unittest.mock.patch("scripts.redroid_doctor.shutil.which", return_value="/usr/bin/adb"):
            checks = inspect_android(runner, "127.0.0.1:5555")
        self.assertEqual(len(checks), 1)
        self.assertEqual(checks[0].status, "PASS")
        self.assertIn("Android 14", checks[0].detail)
        self.assertEqual(runner.call_count, 5)


if __name__ == "__main__":
    unittest.main()

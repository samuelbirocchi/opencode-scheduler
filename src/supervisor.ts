import { existsSync, writeFileSync } from "fs"
import { SUPERVISOR_PATH } from "./constants.js"

const SUPERVISOR_SCRIPT = `#!/usr/bin/perl
use strict;
use warnings;
use JSON;
use POSIX qw(strftime);
use File::Basename;
use File::Path qw(make_path);

my $job_file = $ARGV[0];
if (!$job_file) {
    print STDERR "Usage: $0 <job-file>\\n";
    exit 1;
}

if (!-f $job_file) {
    print STDERR "Job file not found: $job_file\\n";
    exit 1;
}

open(my $fh, '<', $job_file) or die "Cannot open $job_file: $!";
my $content = do { local $/; <$fh> };
close($fh);

my $job = decode_json($content);
my $slug = $job->{slug} || 'unknown';
my $scope_id = $job->{scopeId} || 'legacy';

# Determine log directory
my $log_dir = $ENV{OPENCODE_SCHEDULER_LOG_DIR};
if (!$log_dir) {
    my $home = $ENV{HOME} || $ENV{USERPROFILE} || '.';
    $log_dir = "$home/.config/opencode/scheduler/logs/scheduler/$scope_id";
}
make_path($log_dir, { mode => 0755 }) unless -d $log_dir;

my $log_file = "$log_dir/$slug.log";

# Build opencode command
my $opencode = $ENV{OPENCODE_BINARY} || 'opencode';
my @cmd = ($opencode, 'run');

if ($job->{run}{attachUrl}) {
    push @cmd, '--attach', $job->{run}{attachUrl};
}
if (defined $job->{run}{port}) {
    push @cmd, '--port', $job->{run}{port};
}
if ($job->{run}{command}) {
    push @cmd, '--command', $job->{run}{command};
}
if ($job->{run}{agent}) {
    push @cmd, '--agent', $job->{run}{agent};
}
if ($job->{run}{model}) {
    push @cmd, '--model', $job->{run}{model};
}
if ($job->{run}{variant}) {
    push @cmd, '--variant', $job->{run}{variant};
}
if ($job->{run}{title}) {
    push @cmd, '--title', $job->{run}{title};
}
if ($job->{run}{share}) {
    push @cmd, '--share';
}
if ($job->{run}{continue}) {
    push @cmd, '--continue';
}
if ($job->{run}{session}) {
    push @cmd, '--session', $job->{run}{session};
}
if ($job->{run}{runFormat}) {
    push @cmd, '--format', $job->{run}{runFormat};
}
for my $file (@{$job->{run}{files} || []}) {
    push @cmd, '--file', $file;
}

push @cmd, '--';
push @cmd, $job->{run}{command} ? ($job->{run}{arguments} || '') : ($job->{run}{prompt} || '');

# Run and log
my $start_time = strftime('%Y-%m-%d %H:%M:%S', localtime);
open(my $log, '>>', $log_file) or die "Cannot open log $log_file: $!";
print $log "\\n=== Scheduled run $start_time ===\\n";
print $log "Command: @cmd\\n";
close($log);

my $pid = fork();
if (!defined $pid) {
    die "Failed to fork: $!";
}

if ($pid == 0) {
    # Child process
    open(STDOUT, '>>', $log_file) or die "Cannot redirect stdout: $!";
    open(STDERR, '>>', $log_file) or die "Cannot redirect stderr: $!";
    exec(@cmd) or die "Failed to exec: $!";
}

# Parent waits for child
waitpid($pid, 0);
my $exit_code = $? >> 8;

my $end_time = strftime('%Y-%m-%d %H:%M:%S', localtime);
open($log, '>>', $log_file) or die "Cannot open log $log_file: $!";
print $log "\\n=== Run complete ($exit_code) $end_time ===\\n";
close($log);

exit $exit_code;
`

export function ensureSupervisorScript(): void {
  if (!existsSync(SUPERVISOR_PATH)) {
    writeFileSync(SUPERVISOR_PATH, SUPERVISOR_SCRIPT, { mode: 0o755 })
  }
}
